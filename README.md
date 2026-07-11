# CalendarIA

CalendarIA convierte texto, imágenes y voz en eventos estructurados con Gemini y permite revisarlos antes de guardarlos en Google Calendar.

**Aplicación pública:** `https://calendaria.onrender.com/`

## Qué hace

- Crea eventos manuales y los conserva localmente en el navegador.
- Extrae título, fecha, hora y categoría desde texto o imágenes.
- Captura voz como audio WAV PCM y la analiza con Gemini.
- Obliga a revisar el resultado generado por IA antes de guardarlo.
- Crea y elimina la copia remota del evento en Google Calendar.
- Migra de forma segura los eventos guardados por versiones antiguas de CalendarIA.

## Arquitectura

```text
Browser
├── public/js/app.js       UI y coordinación
├── public/js/api.js       Cliente HTTP same-origin + CSRF
├── public/js/store.js     Estado local versionado
└── public/js/media.js     Imagen y captura WAV PCM
              │
              ▼
Express API
├── OAuth 2.0 + PKCE
├── sesión server-side
├── CSRF y rate limits
├── validación de eventos
├── Google Calendar service
└── Gemini Interactions API
              │
       ┌──────┴──────┐
       ▼             ▼
    Gemini       Google APIs
```

El navegador **no recibe en texto claro** `GEMINI_API_KEY`, `GOOGLE_OAUTH_CLIENT_SECRET`, access tokens ni refresh tokens. Las credenciales OAuth permanecen en el store de sesión del servidor. La cookie contiene únicamente un identificador aleatorio firmado mediante HMAC y se configura como `HttpOnly`, `SameSite=Lax` y `Secure` en producción.

El estado temporal de OAuth (`state` y PKCE verifier) sí viaja en una cookie separada de corta duración, cifrada y autenticada mediante AES-256-GCM. Esa cookie existe únicamente durante el callback OAuth.

## Seguridad

La aplicación pública aplica las siguientes medidas:

- OAuth Authorization Code con PKCE y `state` aleatorio de corta duración.
- Tokens OAuth procesados y almacenados exclusivamente en el servidor.
- Cookie de sesión con ID aleatorio firmado; no contiene tokens OAuth.
- Revocación de la credencial de Google al cerrar sesión.
- CSRF token obligatorio para operaciones con estado.
- Rate limit general por IP y límites adicionales por IP/usuario para IA.
- Prompt de sistema controlado por servidor; el cliente no puede reemplazarlo.
- Gemini Interactions API con salida JSON Schema y segunda validación de dominio.
- `store: false` en las interacciones de Gemini.
- Allowlist de MIME y límites de tamaño para imagen/audio.
- Timeouts para dependencias externas y para el servidor HTTP.
- CSP estricta, HSTS en producción, `nosniff`, `frame-ancestors 'none'` y Permissions Policy.
- Renderizado de datos dinámicos con APIs DOM seguras; no se usa `innerHTML` con contenido del usuario o de la IA.
- Static assets limitados a `public/`; el repositorio completo no se expone como raíz pública.
- Request IDs y errores 5xx sanitizados.

> Las sesiones y los rate limits actuales viven en memoria del proceso. Esta configuración está diseñada para una sola instancia de Render. Antes de escalar horizontalmente, ambos stores deben moverse a Redis u otro almacenamiento distribuido.

## Privacidad y flujo de datos

- Los eventos locales se guardan en `localStorage` del dispositivo.
- El texto, imagen o audio se envía al backend de CalendarIA únicamente cuando el usuario solicita análisis con Gemini.
- Las funciones de IA requieren iniciar sesión con Google para asociar cuotas y limitar abuso.
- CalendarIA configura las interacciones de Gemini con `store: false`.
- Un evento generado por IA no se guarda hasta que el usuario lo revisa y confirma.
- Si el usuario está autenticado, los eventos confirmados se crean en Google Calendar.
- Al eliminar un evento sincronizado desde CalendarIA, primero se elimina la copia de Google Calendar; si Google falla, se conserva la copia local para evitar una falsa confirmación de borrado.

## Requisitos

- Node.js 24.
- Una API key de Gemini.
- Un proyecto de Google Cloud con OAuth 2.0 configurado.
- Google Calendar API habilitada.

## Configuración local

1. Clona el repositorio e instala dependencias:

```bash
git clone https://github.com/aiirvizionz/CalendarIA.git
cd CalendarIA
npm ci
```

2. Copia el archivo de entorno:

```bash
cp .env.example .env
```

3. Configura las variables:

```dotenv
NODE_ENV=development
APP_BASE_URL=http://localhost:3000
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
SESSION_SECRET=...
```

Genera `SESSION_SECRET` con al menos 32 bytes aleatorios. La clave protege la firma del ID de sesión y el estado OAuth temporal. Por ejemplo:

```bash
openssl rand -base64 48
```

4. En el cliente OAuth de Google agrega como URI de redirección autorizada:

```text
http://localhost:3000/api/auth/google/callback
```

5. Inicia CalendarIA:

```bash
npm start
```

Abre `http://localhost:3000`.

## Google OAuth en producción

Para `https://calendaria.onrender.com`, configura en Google Cloud:

```text
Authorized redirect URI:
https://calendaria.onrender.com/api/auth/google/callback
```

El proyecto solicita los scopes:

```text
openid
email
profile
https://www.googleapis.com/auth/calendar.events
```

No cambies `APP_BASE_URL` a un dominio diferente del dominio público real de la aplicación: el backend genera el `redirect_uri` OAuth a partir de esa variable.

## Despliegue en Render

`render.yaml` define:

- Node 24.
- `NODE_ENV=production`.
- instalación reproducible mediante `npm ci`.
- health check en `/health`.
- `SESSION_SECRET` generado por Render.
- secretos de Gemini y Google marcados para configuración manual.

Variables secretas que debes agregar en Render:

```text
GEMINI_API_KEY
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
```

Después de desplegar, confirma que `APP_BASE_URL` coincida con el dominio público y registra el callback exacto en Google Cloud.

## Calidad y pruebas

Ejecuta el chequeo completo:

```bash
npm run ci
```

Incluye:

```bash
npm run check   # node --check sobre JavaScript del proyecto
npm test        # node:test
```

Las pruebas cubren, entre otros casos:

- fechas reales y años bisiestos;
- validación HH:MM de 24 horas;
- categorías y recordatorios permitidos;
- cálculo del fin de un evento sin mezclar UTC y hora local;
- segunda validación de la salida estructurada de Gemini;
- MIME/base64 multimedia;
- extracción de texto desde `model_output` de Interactions API.

GitHub Actions ejecuta `npm ci` y `npm run ci` con Node 24.

## Estructura

```text
CalendarIA/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── js/
│       ├── api.js
│       ├── app.js
│       ├── media.js
│       ├── pcm-recorder-worklet.js
│       └── store.js
├── scripts/
│   └── check-syntax.js
├── src/
│   ├── config.js
│   ├── lib/
│   │   ├── event.js
│   │   ├── rate-limit.js
│   │   └── session.js
│   └── services/
│       ├── gemini.js
│       └── google.js
├── test/
│   ├── event.test.js
│   └── gemini.test.js
├── server.js
├── render.yaml
└── package.json
```

## Limitaciones actuales

- El almacenamiento principal de eventos sigue siendo local al navegador; CalendarIA no incluye una base de datos multi-dispositivo.
- No se importan eventos existentes desde Google Calendar.
- Las sesiones y los límites de uso son locales a la instancia del servidor.
- Un reinicio o redeploy del proceso invalida las sesiones activas y obliga a reconectar Google.
- La captura de voz requiere un navegador con `AudioWorklet` y acceso seguro al micrófono.

## Licencia y uso

Antes de reutilizar el proyecto en un producto comercial, revisa los términos, cuotas y políticas vigentes de Gemini API y Google Calendar API, y añade los avisos legales o de privacidad que correspondan a tu operación.
