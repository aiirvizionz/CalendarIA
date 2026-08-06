'use strict';

const { normalizeAiEvent, ValidationError } = require('../lib/event');
const { EVENT_SCHEMA, buildInteractionRequest, validateAnalyzeRequest } = require('./gemini/schema');
const { createProviderError, extractInteractionText, isRetryableStatus, requestInteraction } = require('./gemini/provider');

async function analyzeEvent(input, timeZone, requestId = '') {
  const request = validateAnalyzeRequest(input);
  console.log(JSON.stringify({ event: 'ai_analysis_started', analysisId: requestId || undefined, modelInput: [request.text && 'text', request.image && 'image', request.audio && 'audio'].filter(Boolean), timeZone }));
  const payload = await requestInteraction(JSON.stringify(buildInteractionRequest(request, timeZone)));
  const text = extractInteractionText(payload);
  if (!text) { const error = new Error('Gemini no devolvió un evento utilizable. Intenta describirlo de otra forma.'); error.statusCode = 422; error.code = 'AI_EMPTY_RESPONSE'; throw error; }
  try {
    const event = normalizeAiEvent(JSON.parse(text));
    console.log(JSON.stringify({ event: 'ai_analysis_succeeded', analysisId: requestId || undefined, interactionId: payload?.id || undefined }));
    return event;
  } catch (cause) {
    const error = new Error('Gemini devolvió un evento con formato inválido. Intenta nuevamente.'); error.statusCode = 422; error.code = 'AI_INVALID_RESPONSE';
    error.provider = { httpStatus: 200, status: 'INVALID_MODEL_OUTPUT', message: String(cause?.message || '').slice(0, 300) };
    throw error;
  }
}

module.exports = { EVENT_SCHEMA, analyzeEvent, buildInteractionRequest, createProviderError, extractInteractionText, isRetryableStatus, validateAnalyzeRequest };
