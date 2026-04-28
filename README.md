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

## Despliegue en Render

Este proyecto puede publicarse como un Web Service de Node.js.

### Variables de entorno

- `API_KEY_GEMINI`
- `GOOGLE_AUTH_API_KEY`
- `GEMINI_MODEL`

### Pasos rápidos

1. Sube el repositorio a GitHub.
2. Crea un Web Service en Render y conecta este repo.
3. Usa el comando de inicio: `npm start`.
4. Añade las variables de entorno en el panel de Render.
5. Espera a que Render termine el build y abre la URL pública.

## Importante

- No subas [.env](.env) al repositorio.
- El proyecto usa backend con Express, así que no funciona solo con GitHub Pages.