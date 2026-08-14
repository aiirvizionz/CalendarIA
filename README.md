<div align="center">

# CalendarIA

### Convierte texto, imágenes y voz en propuestas de eventos revisables para Google Calendar.

[![CI](https://github.com/aiirvizionz/CalendarIA/actions/workflows/ci.yml/badge.svg)](https://github.com/aiirvizionz/CalendarIA/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-Interactions_API-8E75B2?logo=googlegemini&logoColor=white)
![Google Calendar](https://img.shields.io/badge/Google_Calendar-API-4285F4?logo=googlecalendar&logoColor=white)
![Render](https://img.shields.io/badge/Deploy-Render-000000?logo=render&logoColor=white)

**[Abrir CalendarIA](https://calendaria.onrender.com/)** · **[Política de privacidad](https://calendaria.onrender.com/privacy.html)**

</div>

---

## Estado actual

**CalendarIA 2.0.0** es una aplicación web de agenda inteligente que integra Gemini con Google Calendar. La versión estable actual permite crear eventos manualmente o convertir texto, imágenes y voz en una propuesta estructurada que el usuario puede revisar antes de enviarla a Google Calendar.

La regla central del producto es sencilla:

> **La IA propone. El usuario revisa. Google Calendar conserva el evento.**

```text
Texto ──────┐
Imagen ─────┼──► Gemini ──► Propuesta estructurada ──► Revisión ──► Google Calendar
Voz ────────┘

Manual ───────────────────────────────────────────────► Google Calendar
```

Google Calendar es la fuente de verdad de la agenda. CalendarIA no mantiene una base de datos propia de eventos ni depende de `localStorage` para conservarlos.

---

## Funciones disponibles en la versión estable

### Creación manual

El formulario manual permite capturar:

- título;
- fecha;
- hora;
- categoría;
- uno o varios recordatorios predefinidos.

### Análisis con Gemini

La IA admite tres tipos de entrada:

- **Texto:** hasta 3000 caracteres.
- **Imagen:** JPG, PNG o WebP de hasta 4 MB; el navegador intenta optimizar imágenes grandes antes del envío.
- **Voz:** captura mono mediante Web Audio/`AudioWorklet`, convertida a WAV PCM de 16 bits y limitada a 60 segundos.

Gemini devuelve **un único evento** por análisis con los campos `titulo`, `fecha`, `hora` y `categoria`. El resultado pasa por Structured Outputs y por una segunda validación de dominio antes de mostrarse al usuario.

Si la entrada no incluye una hora explícita, la versión estable utiliza estos valores por categoría:

| Categoría | Hora propuesta por defecto |
|---|---:|
| Examen | 08:00 |
| Estudio | 16:00 |
| Social | 18:00 |
| Presentación | 09:00 |
| Tarea | 09:00 |
| Otro | 09:00 |

La interacción se envía a Gemini con `store: false`. CalendarIA no agenda automáticamente el resultado: primero lo presenta en la pantalla de revisión.

---

## Modelo de evento actual

La versión estable trabaja con este contrato:

```json
{
  "title": "Examen de Redes",
  "date": "2026-08-18",
  "time": "08:00",
  "category": "examen",
  "reminders": [10, 60]
}
```

### Categorías permitidas

- `examen`
- `estudio`
- `social`
- `presentacion`
- `tarea`
- `otro`

### Recordatorios permitidos

- 10 minutos
- 1 hora
- 6 horas
- 1 día
- 1 semana

Los eventos creados por CalendarIA tienen actualmente una **duración fija de 60 minutos**. En Google Calendar se añade una descripción con la categoría y la indicación de que el evento fue creado con CalendarIA.

> La rama estable actual **no crea recurrencias, eventos de todo el día, ubicaciones, descripciones personalizadas ni duraciones variables** desde el formulario de CalendarIA.

---

## Integración con Google Calendar

CalendarIA solicita los scopes:

```text
openid
email
profile
https://www.googleapis.com/auth/calendar.events
```

El flujo utiliza **OAuth 2.0 Authorization Code + PKCE**.

### Lectura de agenda

La aplicación consulta el calendario principal y muestra eventos que cumplen las condiciones de la implementación actual:

- tipo de evento `default`;
- creados por la cuenta autenticada (`creator.self`);
- aún no finalizados;
- ordenados por la próxima fecha de inicio.

CalendarIA puede leer eventos de todo el día ya existentes en Google Calendar y puede detectar series recurrentes existentes. Para la interfaz, las ocurrencias de una misma serie se agrupan y se muestra su próxima ocurrencia junto con una etiqueta de frecuencia básica.

### Recurrencias

La versión estable **solo interpreta recurrencias ya existentes en Google Calendar** para agruparlas en la agenda. No envía reglas `RRULE` al crear nuevos eventos.

Cuando se elimina desde CalendarIA una tarjeta que representa una serie recurrente, la implementación actual utiliza el identificador de la serie, por lo que la acción elimina la **serie recurrente completa** tras la confirmación del usuario.

### Prevención de duplicados

Antes de crear un evento, el backend busca una coincidencia por:

```text
título normalizado + fecha local + hora local
```

Si encuentra una coincidencia, devuelve el evento existente y evita crear una copia.

### Edición

El backend incluye un endpoint `PATCH /api/calendar/events/:eventId`, pero la interfaz estable actual **no expone edición de eventos existentes**. La edición desde UI sigue siendo una mejora pendiente.

---

## Sesión, OAuth y cookies

La documentación anterior describía incorrectamente un almacenamiento de sesión server-side. La implementación estable actual funciona así:

### `calendaria_session`

Cookie `HttpOnly` cifrada y autenticada con **AES-256-GCM**. Su payload puede contener:

- perfil básico de Google (`sub`, nombre, email y fotografía);
- access token;
- refresh token disponible;
- expiración del access token;
- token CSRF;
- expiración de la sesión.

Su duración máxima configurada es de **30 días**.

### `calendaria_google_grant`

Cookie `HttpOnly` separada, también cifrada con AES-256-GCM. Conserva la concesión necesaria para reutilizar el refresh token y reducir solicitudes repetidas de consentimiento de Google.

Su duración máxima configurada es de **180 días**.

### `calendaria_oauth`

Cookie temporal cifrada utilizada durante el callback de OAuth. Conserva `state` y el verificador PKCE durante un máximo aproximado de **10 minutos** y está restringida a la ruta del callback.

En producción las cookies usan `Secure` y `SameSite=Lax`.

**Cerrar sesión** elimina `calendaria_session`, pero no equivale a revocar la autorización de Google ni elimina automáticamente `calendaria_google_grant`. La revocación completa puede realizarse desde la configuración de aplicaciones de terceros de la Cuenta de Google.

---

## Privacidad y separación de datos

Los eventos consultados desde Google Calendar **no se envían a Gemini**.

Los flujos están separados:

```text
Google Calendar ──► agenda visible y operaciones solicitadas

Texto / imagen / voz del usuario ──► Gemini ──► propuesta de evento
```

CalendarIA no mantiene una base de datos propia de perfiles o eventos. El frontend elimina claves heredadas de almacenamiento local y no utiliza `localStorage` como fuente de verdad.

La política de privacidad pública describe con más detalle el tratamiento actual de cookies, tokens, Google Calendar, Gemini, logs técnicos y proveedores:

**https://calendaria.onrender.com/privacy.html**

---

## Seguridad aplicada

### OAuth y sesión

- Authorization Code + PKCE.
- `state` temporal para validar el callback.
- cookies `HttpOnly` cifradas/autenticadas mediante AES-256-GCM.
- clave AES derivada de `SESSION_SECRET` mediante SHA-256.
- `Secure` en producción.
- `SameSite=Lax`.
- CSRF token para operaciones de escritura autenticadas.

### API y navegador

- Content Security Policy.
- HSTS en producción.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY`.
- Referrer Policy.
- Permissions Policy.
- Request IDs.
- respuestas `/api/*` con `Cache-Control: no-store`.
- límite JSON de 12 MB.
- timeouts de servidor y servicios externos.
- errores 5xx sanitizados para el cliente.

### Rate limiting

La versión estable utiliza límites **en memoria del proceso**:

- tráfico público: 120 solicitudes/minuto/IP;
- IA: 60 solicitudes/15 min/IP;
- IA: 20 solicitudes/15 min/usuario;
- Calendar API: 30 solicitudes/minuto/usuario.

Estos límites no se comparten entre múltiples instancias y se reinician cuando reinicia el proceso. Redis sigue siendo una mejora pendiente para rate limiting y sesiones distribuidas.

### Gemini

- system instruction controlado por backend;
- Structured Outputs;
- segunda validación de dominio;
- allowlist de tipos MIME;
- límites de tamaño;
- hasta 3 intentos para errores transitorios del proveedor;
- `store: false` en la solicitud;
- logs correlacionados por `analysisId`/`requestId` sin incluir deliberadamente el texto, imagen, audio ni API key enviados por el usuario.

---

## Arquitectura

```text
CalendarIA
│
├── Browser
│   ├── public/index.html
│   ├── public/js/app.js                 UI y flujo principal
│   ├── public/js/api.js                 cliente HTTP same-origin
│   ├── public/js/media.js               imagen y captura de audio
│   └── public/js/pcm-recorder-worklet.js
│
├── Express API
│   ├── server.js                        rutas, seguridad y API
│   ├── src/config.js                    configuración
│   ├── src/lib/event.js                 contrato y validación
│   ├── src/lib/session.js               cookies cifradas y CSRF
│   ├── src/lib/rate-limit.js            límites en memoria
│   ├── src/services/gemini.js           extracción multimodal
│   └── src/services/google.js           OAuth y Google Calendar
│
├── Gemini Interactions API
└── Google Calendar API
```

El frontend utiliza HTML, CSS y **Vanilla JavaScript ES Modules**, sin framework de UI ni proceso de bundling.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | HTML5, CSS, Vanilla JavaScript ES Modules |
| Backend | Node.js 24, Express 4 |
| IA | Gemini Interactions API |
| Salida IA | Structured Outputs + validación de dominio |
| Autorización | Google OAuth 2.0 + PKCE |
| Agenda | Google Calendar API |
| Audio | Web Audio API, AudioWorklet, WAV PCM 16-bit |
| Cookies | HttpOnly + AES-256-GCM |
| Tests | `node:test` |
| CI | GitHub Actions |
| Deploy | Render |

---

## Variables de entorno

En producción se utilizan principalmente:

```text
SESSION_SECRET
APP_BASE_URL
GEMINI_API_KEY
GEMINI_MODEL
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
PORT
NODE_ENV
```

`SESSION_SECRET` debe tener al menos 32 bytes.

La configuración de Render del repositorio despliega `main`, ejecuta `npm ci && npm run ci`, inicia con `npm start` y comprueba `/health`.

---

## Desarrollo local

Requisitos:

- Node.js 24.x
- npm
- credenciales de Gemini si se desea usar IA
- credenciales OAuth de Google si se desea usar Google Calendar

Instalación:

```bash
npm ci
```

Ejecución:

```bash
npm start
```

Validación:

```bash
npm run check
npm test
# o ambos:
npm run ci
```

---

## Estado funcional

### Implementado

- [x] Creación manual de eventos.
- [x] Extracción de un evento mediante texto.
- [x] Análisis de imágenes JPG/PNG/WebP.
- [x] Captura y análisis de voz.
- [x] Revisión humana de propuestas de IA.
- [x] OAuth 2.0 + PKCE.
- [x] Google Calendar como fuente de verdad.
- [x] Consulta de próximos eventos creados por el usuario.
- [x] Lectura y agrupación visual de series recurrentes existentes.
- [x] Prevención básica de duplicados.
- [x] Renovación de access tokens mediante refresh token.
- [x] Eliminación remota de eventos.
- [x] Rate limiting y CSRF.
- [x] CSP y hardening HTTP.
- [x] Tests con `node:test` y CI en GitHub Actions.
- [x] Interfaz responsive.

### No forma parte de la versión estable actual

- [ ] Creación de recurrencias desde CalendarIA.
- [ ] Duración personalizada de eventos.
- [ ] Eventos de todo el día desde el formulario.
- [ ] Ubicación y descripción personalizadas.
- [ ] Recordatorios arbitrarios fuera de los cinco valores soportados.
- [ ] Edición de eventos existentes desde la interfaz.
- [ ] Selección de calendario destino.
- [ ] Extracción de varios eventos en una sola solicitud.
- [ ] Sesiones server-side/Redis.
- [ ] Rate limiting distribuido.
- [ ] Sincronización incremental con `syncToken` o webhooks.
- [ ] Observabilidad externa dedicada.
- [ ] PWA como funcionalidad estable.

---

## Política de privacidad

La política pública se encuentra en:

**https://calendaria.onrender.com/privacy.html**

La versión del repositorio está en [`public/privacy.html`](public/privacy.html).

---

## Autor

**David Alejandro Lopez Huerta**  
Estudiante de Ingeniería en Sistemas · FIME, UANL

Proyecto enfocado en integración de IA multimodal, desarrollo web, APIs de Google y diseño seguro de aplicaciones públicas.

[GitHub @aiirvizionz](https://github.com/aiirvizionz)

---

<div align="center">

**CalendarIA · La IA propone. Tú decides qué entra a tu calendario.**

</div>
