<div align="center">

# CalendarIA

### Convierte lenguaje natural, imágenes y voz en eventos listos para Google Calendar.

[![CI](https://github.com/aiirvizionz/CalendarIA/actions/workflows/ci.yml/badge.svg)](https://github.com/aiirvizionz/CalendarIA/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-Interactions_API-8E75B2?logo=googlegemini&logoColor=white)
![Google Calendar](https://img.shields.io/badge/Google_Calendar-API-4285F4?logo=googlecalendar&logoColor=white)
![Render](https://img.shields.io/badge/Deploy-Render-000000?logo=render&logoColor=white)

**[Abrir CalendarIA](https://calendaria.onrender.com/)**

</div>

---

## El proyecto

**CalendarIA** es una agenda inteligente que reduce la fricción de crear eventos y los integra directamente con Google Calendar.

En lugar de capturar manualmente cada campo, el usuario puede escribir una frase, adjuntar una captura o describir un compromiso por voz. Gemini interpreta la entrada y propone un evento estructurado para revisión.

> “Tengo examen de Redes el próximo martes a las 8 de la mañana.”

```text
Examen de Redes
Martes · 08:00
Categoría: Examen
```

La IA propone. **El usuario confirma. Google Calendar conserva el evento.**

---

## ¿Qué problema resuelve?

Crear un evento suele implicar interrumpir una actividad, abrir una aplicación y capturar título, fecha, hora y recordatorios.

CalendarIA transforma información cotidiana en una acción estructurada:

```text
Texto ──────┐
Imagen ─────┼──► Gemini ──► Evento estructurado ──► Revisión ──► Google Calendar
Voz ────────┘
```

El proyecto explora una experiencia de agenda **multimodal, segura y centrada en revisión humana**.

---

## Experiencia multimodal

### Texto

CalendarIA entiende expresiones naturales y temporales como:

- “Mañana tengo que entregar el proyecto a las 4.”
- “Presentación de IA el viernes a las 9 am.”
- “Estudiar redes el próximo lunes.”

La fecha local y la zona horaria del usuario forman parte del contexto de extracción.

### Imagen

Una captura de horario, tarea o notificación puede convertirse en un evento. El frontend admite JPG, PNG y WebP dentro de límites controlados y el backend vuelve a validar el contenido antes de enviarlo a Gemini.

### Voz

La aplicación captura audio mono mediante `AudioWorklet`, genera WAV PCM de 16 bits y utiliza Gemini para extraer el evento.

La grabación se limita a 60 segundos y pasa por la misma revisión humana que texto e imagen.

---

## Google Calendar como fuente de verdad

CalendarIA no mantiene una agenda paralela en el navegador.

```text
Confirmar evento
      │
      ▼
CalendarIA API
      │
      ▼
Google Calendar API
      │
      ├── Creado o ya existente ──► Actualizar “Tus eventos”
      │
      └── Error ──────────────────► No crear copia local
```

Los eventos visibles se consultan desde el calendario principal de Google. CalendarIA muestra únicamente eventos regulares creados por la cuenta autenticada que todavía no han terminado.

Las series recurrentes se agrupan en una sola tarjeta y conservan la próxima ocurrencia futura junto con su frecuencia.

Antes de crear un evento, el backend busca una coincidencia por **título normalizado + fecha local + hora local** para evitar duplicados reales en Google Calendar.

---

## Arquitectura

```text
CalendarIA
│
├── Browser
│   ├── app.js                  UI y flujo de interacción
│   ├── api.js                  Cliente HTTP same-origin
│   ├── store.js                Estado transitorio de sincronización
│   ├── media.js                Imagen y captura WAV PCM
│   └── pcm-recorder-worklet.js Procesamiento de audio
│
├── Express API
│   ├── config.js               Configuración de entorno
│   ├── event.js                Dominio y validación
│   ├── session.js              Sesiones y CSRF
│   ├── rate-limit.js           Límites de uso
│   ├── gemini.js               Extracción multimodal
│   └── google.js               OAuth y Calendar API
│
├── Gemini
│   └── Interactions API
│
└── Google Calendar
    └── Events API · fuente de verdad de eventos
```

El frontend utiliza **Vanilla JavaScript modular**. La decisión mantiene una superficie pequeña, sin runtime de framework ni proceso de bundle innecesario para la complejidad actual del producto.

---

## IA con salida estructurada

El navegador no controla las instrucciones privilegiadas del modelo. El system instruction pertenece al backend y Gemini recibe una tarea limitada: extraer un único evento.

La respuesta esperada tiene esta forma:

```json
{
  "titulo": "Presentación final",
  "fecha": "2026-12-01",
  "hora": "09:00",
  "categoria": "presentacion"
}
```

CalendarIA utiliza Structured Outputs dentro del subconjunto de JSON Schema admitido por Gemini y después ejecuta una segunda validación de dominio sobre:

- título;
- fecha real de calendario;
- hora de 24 horas;
- categorías permitidas;
- recordatorios permitidos.

Las interacciones se envían con `store: false` y ningún resultado de IA se agenda automáticamente.

---

## Seguridad por diseño

CalendarIA está diseñado para exposición pública en una única instancia de aplicación.

### Gemini

- El cliente no puede reemplazar el system instruction.
- El endpoint requiere sesión autenticada y CSRF token.
- Hay límites de uso por usuario e IP.
- Imagen y audio usan allowlists MIME y límites de tamaño.
- Los errores de IA se correlacionan mediante `requestId`/`analysisId`.
- Los logs no almacenan prompts, imágenes, audio ni API keys.
- Los errores transitorios del proveedor usan reintentos acotados con backoff.

### OAuth y Google Calendar

El flujo utiliza **OAuth 2.0 Authorization Code + PKCE**.

Los access tokens y refresh tokens permanecen en el servidor. La cookie del navegador contiene únicamente un identificador de sesión aleatorio firmado mediante HMAC.

El estado temporal de OAuth se cifra y autentica con AES-256-GCM.

### Hardening HTTP

La API incorpora Content Security Policy, HSTS en producción, `nosniff`, protección contra framing, Referrer Policy, Permissions Policy, Request IDs, errores 5xx sanitizados, timeouts y límites de tamaño de request.

Los datos dinámicos se renderizan mediante APIs DOM seguras y no mediante `innerHTML` con contenido procedente del usuario o del modelo.

---

## Calidad de código

El repositorio utiliza `node:test`, validación sintáctica automatizada y GitHub Actions sobre Node.js 24.

La cobertura funcional contempla, entre otros casos:

- fechas reales y años bisiestos;
- horas válidas en formato de 24 horas;
- categorías y recordatorios permitidos;
- manejo de zona horaria sin mezclar UTC y hora local;
- validación secundaria de respuestas de IA;
- Structured Outputs compatibles con Gemini;
- payload multimodal `user_input` para texto, imagen y audio;
- MIME y Base64 multimedia;
- filtro de eventos creados por el usuario;
- exclusión de eventos automáticos y pasados;
- agrupación de recurrencias;
- prevención de eventos duplicados;
- ausencia de persistencia local de eventos.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | HTML5, CSS, Vanilla JavaScript ES Modules |
| Backend | Node.js 24, Express |
| Inteligencia artificial | Gemini Interactions API |
| Salida de IA | Structured Outputs + validación de dominio |
| Autorización | Google OAuth 2.0 + PKCE |
| Calendario y eventos | Google Calendar API |
| Audio | Web Audio API, AudioWorklet, WAV PCM |
| Sesiones | Server-side + cookie HttpOnly firmada |
| CI | GitHub Actions |
| Deploy | Render |

---

## Estado del proyecto

**CalendarIA 2.0** representa la evolución del MVP inicial hacia una aplicación multimodal integrada con servicios reales de Google.

### Implementado

- [x] Creación manual de eventos
- [x] Extracción mediante texto
- [x] Análisis de imágenes
- [x] Captura y análisis de voz
- [x] Revisión humana de resultados de IA
- [x] OAuth 2.0 + PKCE
- [x] Google Calendar como fuente de verdad
- [x] Consulta de próximos eventos creados por el usuario
- [x] Agrupación de recurrencias
- [x] Prevención de duplicados
- [x] Refresh de tokens
- [x] Eliminación remota consistente
- [x] Rate limiting y CSRF
- [x] CSP y hardening HTTP
- [x] Logging correlacionado de IA
- [x] Tests y CI
- [x] Interfaz responsive

### Próximos retos

- [ ] Edición de eventos desde la interfaz
- [ ] Redis para sesiones y rate limiting distribuido
- [ ] Métricas y observabilidad
- [ ] PWA

---

## Autor

**David Alejandro Lopez Huerta**  
Estudiante de Ingeniería en Sistemas · FIME, UANL

Proyecto enfocado en integración de IA multimodal, desarrollo web y diseño seguro de servicios públicos.

[GitHub @aiirvizionz](https://github.com/aiirvizionz)

---

<div align="center">

**CalendarIA · La IA propone. Tú decides qué entra a tu calendario.**

</div>
