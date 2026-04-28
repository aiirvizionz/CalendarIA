# CalendarIA

AgendaAI con Gemini para crear eventos desde texto, imagen y audio.

## Requisitos

- Node.js 18 o superior
- Una API key de Gemini
- Un Client ID de Google OAuth para Calendar

## Configuración

1. Copia [.env.example](.env.example) como [.env](.env).
2. Completa las variables:
   - `API_KEY_GEMINI`
   - `GOOGLE_AUTH_API_KEY`
   - `GEMINI_MODEL`
3. Instala dependencias:

   npm install

## Ejecución

Inicia el servidor con:

npm start

Luego abre:

http://localhost:3000

## Importante

- No subas [.env](.env) al repositorio.
- El proyecto usa backend con Express, así que no funciona solo con GitHub Pages.