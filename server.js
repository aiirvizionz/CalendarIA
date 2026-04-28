const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash';
const PREFERRED_MODELS = [
  DEFAULT_GEMINI_MODEL,
  'models/gemini-2.5-flash',
  'models/gemini-2.5-flash-lite',
  'models/gemini-2.5-pro',
  'models/gemini-2.0-flash',
  'models/gemini-1.5-flash-latest',
  'models/gemini-1.5-flash',
];

let cachedGenerativeModels = null;
let lastModelCacheAt = 0;

app.use(express.json({ limit: '15mb' }));
app.use(express.static(__dirname));

function normalizeModelName(name) {
  if (!name) return '';
  return name.startsWith('models/') ? name : `models/${name}`;
}

async function listGenerativeModels() {
  const now = Date.now();
  const cacheIsFresh = cachedGenerativeModels && now - lastModelCacheAt < 5 * 60 * 1000;
  if (cacheIsFresh) return cachedGenerativeModels;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.API_KEY_GEMINI}`
  );

  if (!response.ok) {
    throw new Error(`No se pudo listar modelos (${response.status})`);
  }

  const payload = await response.json();
  const models = (payload.models || [])
    .filter((model) => (model.supportedGenerationMethods || []).includes('generateContent'))
    .map((model) => model.name)
    .filter(Boolean);

  cachedGenerativeModels = models;
  lastModelCacheAt = now;
  return models;
}

async function resolveCandidateModels() {
  const available = await listGenerativeModels();
  const availableSet = new Set(available.map(normalizeModelName));

  const preferred = [...new Set(PREFERRED_MODELS.map(normalizeModelName))]
    .filter((model) => availableSet.has(model));

  const additionalFlash = available
    .map(normalizeModelName)
    .filter((model) => /flash/i.test(model) && !preferred.includes(model));

  const fallbackAny = available
    .map(normalizeModelName)
    .filter((model) => !preferred.includes(model) && !additionalFlash.includes(model));

  return [...preferred, ...additionalFlash, ...fallbackAny];
}

app.get('/api/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_AUTH_API_KEY || '',
  });
});

app.post('/api/gemini', async (req, res) => {
  try {
    const { systemPrompt, partsContent } = req.body || {};

    if (!process.env.API_KEY_GEMINI) {
      return res.status(500).json({ error: 'Falta API_KEY_GEMINI en .env' });
    }

    if (!systemPrompt || !Array.isArray(partsContent) || partsContent.length === 0) {
      return res.status(400).json({ error: 'Solicitud invalida para Gemini' });
    }

    const requestBody = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: partsContent }],
      generationConfig: { response_mime_type: 'application/json' },
    };

    const candidateModels = await resolveCandidateModels();
    if (!candidateModels.length) {
      return res.status(500).json({ error: 'No hay modelos compatibles con generateContent para esta API key' });
    }

    const triedModels = [];
    let data = null;
    let lastStatus = 500;
    let lastError = 'Error al consultar Gemini';

    for (const model of candidateModels) {
      triedModels.push(model);

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${process.env.API_KEY_GEMINI}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      let responseData = null;
      try {
        responseData = await geminiResponse.json();
      } catch (error) {
        responseData = null;
      }

      if (geminiResponse.ok) {
        data = responseData;
        break;
      }

      lastStatus = geminiResponse.status;
      lastError = responseData?.error?.message || 'Error al consultar Gemini';

      const isModelNotFound = /not found|not supported/i.test(lastError);
      if (!isModelNotFound) {
        return res.status(lastStatus).json({ error: lastError });
      }
    }

    if (!data) {
      return res.status(lastStatus).json({
        error: `${lastError}. Modelos probados: ${triedModels.join(', ')}`,
      });
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return res.status(500).json({ error: 'Gemini no devolvio contenido' });
    }

    return res.json({ rawText });
  } catch (error) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CalendarIA corriendo en http://localhost:${PORT}`);
  console.log(`Modelo Gemini por defecto: ${DEFAULT_GEMINI_MODEL}`);
}).on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} ya esta en uso. Cierra el proceso previo o usa otro PORT en .env`);
    process.exit(1);
  }

  console.error('Error iniciando servidor:', error.message || error);
  process.exit(1);
});
