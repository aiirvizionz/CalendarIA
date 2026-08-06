<div align="center">

# CalendarIA

### Convierte lenguaje natural, imágenes y voz en eventos revisables para Google Calendar.

[![CI](https://github.com/aiirvizionz/CalendarIA/actions/workflows/ci.yml/badge.svg)](https://github.com/aiirvizionz/CalendarIA/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-Interactions_API-8E75B2?logo=googlegemini&logoColor=white)
![Google Calendar](https://img.shields.io/badge/Google_Calendar-API-4285F4?logo=googlecalendar&logoColor=white)

**[Abrir CalendarIA](https://calendaria.onrender.com/)**

</div>

---

## Qué hace

CalendarIA reduce la fricción de crear y mantener una agenda. El usuario puede escribir, adjuntar una captura o hablar con naturalidad; Gemini transforma la entrada en una propuesta estructurada y el usuario la revisa antes de guardarla.

```text
Texto ──────┐
Imagen ─────┼──► Gemini ──► Propuesta ──► Revisión humana ──► Google Calendar
Voz ────────┘
```

Puede interpretar solicitudes como:

- “Tengo examen de Redes el martes a las 8 y avísame un día antes.”
- “Clase de inglés todos los sábados a las 9 hasta diciembre.”
- “Revisión del proyecto cada dos viernes a las 4, dura 90 minutos y recuérdamelo una hora antes.”

La propuesta admite título, fecha, hora, todo el día, duración, categoría, ubicación, descripción, hasta cinco avisos y recurrencia diaria, semanal, mensual o anual.

## Categorías y colores

Cada categoría tiene una identidad visual fija y se guarda usando el mismo `colorId` de Google Calendar:

| Categoría | Color | Google `colorId` |
|---|---|---:|
| Examen | rojo | 11 |
| Tarea | naranja | 6 |
| Clase | azul | 9 |
| Estudio | verde | 2 |
| Presentación | amarillo | 5 |
| Social | rosa | 4 |
| Otro | gris | 8 |

La categoría también se conserva en `extendedProperties.private`, de modo que CalendarIA puede identificar sus eventos sin añadir metadatos técnicos a la descripción visible.

## Recurrencias y avisos

Las recurrencias se traducen a reglas `RRULE` de Google Calendar. Se soportan intervalos, días concretos de la semana y finalización por fecha o número de repeticiones.

```text
“cada dos viernes”
→ FREQ=WEEKLY;INTERVAL=2;BYDAY=FR
```

Los avisos ya no están limitados a una lista fija: el dominio acepta minutos personalizados dentro del rango compatible con Google Calendar.

## Edición y sincronización

Google Calendar continúa siendo la fuente de verdad. CalendarIA puede crear, editar, eliminar, abrir y filtrar eventos por categoría. Las series recurrentes se agrupan por su próxima ocurrencia y la interfaz permite actuar sobre una ocurrencia o sobre toda la serie.

La creación conserva una identificación privada de origen y categoría. La prevención de duplicados mantiene la comparación por título, fecha y hora, y la consulta de agenda limita la ventana futura y solicita solo los campos necesarios.

## IA multimodal

- **Texto:** lenguaje natural, fechas relativas, duración, avisos y recurrencia.
- **Imagen:** JPG, PNG y WebP con optimización en navegador y validación de MIME/tamaño en backend.
- **Voz:** captura mono mediante `AudioWorklet`, conversión a WAV PCM y análisis con Gemini.
- **Corrección contextual:** el backend puede recibir una propuesta ya validada como contexto para interpretar instrucciones posteriores sin convertir ese contenido en una instrucción privilegiada.

Si falta una hora, CalendarIA puede proponer una y la registra como supuesto para que el usuario pueda revisarla. Ninguna propuesta se agenda automáticamente.

## Seguridad

El flujo de Google utiliza OAuth 2.0 Authorization Code + PKCE.

- Access y refresh tokens se conservan cifrados y autenticados con AES-256-GCM dentro de cookies `HttpOnly`; el JavaScript del navegador no puede leerlos.
- El estado temporal de OAuth también se cifra y autentica.
- La concesión de Google queda separada de la sesión para reducir consentimientos repetidos.
- CSRF para escrituras, CSP/HSTS, límites por IP/usuario, validación de dominio y timeouts.
- Gemini usa Structured Outputs, segunda validación y `store: false`.
- Los logs no están diseñados para guardar prompts, audio, imágenes, tokens ni títulos de eventos.

La documentación refleja este modelo actual. Como siguiente paso de infraestructura, Redis permitiría mover tokens y sesiones a almacenamiento server-side, compartir rate limiting entre instancias y revocar sesiones de forma centralizada.

## PWA

El proyecto incluye manifest y service worker para instalación y cacheo del shell estático. Las rutas `/api/*` nunca se almacenan en cache.

## Arquitectura

```text
Browser
├── app.js / enhancements     UI, edición, recurrencia y colores
├── api.js                    Cliente HTTP same-origin
├── media.js                  Imagen y audio
└── service-worker.js         PWA

Express API
├── event.js                  Dominio, categorías, colores y validación
├── session.js                Cookies cifradas + CSRF
├── gemini/*                  IA estructurada y proveedor
└── google/*                  OAuth + Calendar API
```

## Calidad

El repositorio usa `node:test`, validación sintáctica y GitHub Actions. Las pruebas cubren dominio, fechas, recurrencias, colores, payload de Google, deduplicación, Gemini, OAuth, sesiones y PWA.

## Próximos pasos de infraestructura

- Redis para sesiones y rate limiting distribuido.
- Sincronización incremental con `syncToken` y, si el despliegue lo requiere, notificaciones push de Google Calendar.
- Observabilidad externa (métricas, trazas y alertas).
- Pruebas E2E de navegador y accesibilidad automatizada.
- Creación por lotes de varios eventos desde una sola entrada.

---

**CalendarIA · La IA propone. Tú decides qué entra a tu calendario.**
