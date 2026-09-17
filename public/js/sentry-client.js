const SDK_URL = 'https://browser.sentry-cdn.com/10.75.0/bundle.tracing.replay.min.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (window.Sentry) resolve();
      else existing.addEventListener('load', resolve, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.defer = true;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error('No se pudo cargar Sentry Browser SDK')), { once: true });
    document.head.appendChild(script);
  });
}

function sanitizeEvent(event) {
  if (event?.request?.url) {
    try {
      const url = new URL(event.request.url, window.location.origin);
      url.search = '';
      url.hash = '';
      event.request.url = url.toString();
    } catch {
      // Keep the SDK-provided value if it is not a valid URL.
    }
  }

  if (event?.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
  }

  return event;
}

async function initializeSentry() {
  try {
    const response = await fetch('/api/observability/config', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;

    const config = await response.json();
    if (!config?.enabled || !config?.dsn) return;

    await loadScript(SDK_URL);
    if (!window.Sentry?.init) return;

    const integrations = [];
    if (typeof window.Sentry.browserTracingIntegration === 'function') {
      integrations.push(window.Sentry.browserTracingIntegration());
    }
    if (typeof window.Sentry.replayIntegration === 'function') {
      integrations.push(window.Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }));
    }

    window.Sentry.init({
      dsn: config.dsn,
      environment: config.environment || 'production',
      release: config.release || undefined,
      sendDefaultPii: false,
      integrations,
      tracesSampleRate: Number(config.tracesSampleRate || 0),
      replaysSessionSampleRate: Number(config.replaysSessionSampleRate || 0),
      replaysOnErrorSampleRate: Number(config.replaysOnErrorSampleRate || 0),
      tracePropagationTargets: [window.location.origin, /^\//],
      beforeSend: sanitizeEvent,
    });
  } catch (error) {
    // Observability must never prevent CalendarIA from loading.
    console.debug('sentry_browser_disabled', error?.message || error);
  }
}

void initializeSentry();
