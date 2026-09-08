function ensureFooterStyles() {
  if (document.querySelector('link[data-calendar-footer-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/unified-footer.css?v=1';
  link.dataset.calendarFooterStyles = 'true';
  document.head.appendChild(link);
}

function currentRoute() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/welcome') return 'welcome';
  if (path === '/privacy' || path === '/privacy.html') return 'privacy';
  return 'app';
}

function footerMarkup(active) {
  const current = (route) => active === route ? ' aria-current="page"' : '';
  return `
    <div class="calendar-footer-inner">
      <a class="calendar-footer-brand" href="/" aria-label="CalendarIA, ir a la aplicación">
        <img src="/assets/calendaria-logo.svg" alt="">
        <span>CalendarIA</span>
      </a>
      <nav class="calendar-footer-nav" aria-label="Navegación de CalendarIA">
        <a class="calendar-footer-link" href="/"${current('app')}>Aplicación</a>
        <a class="calendar-footer-link" href="/welcome"${current('welcome')}>Bienvenida</a>
        <a class="calendar-footer-link" href="/privacy.html"${current('privacy')}>Privacidad</a>
        <a class="calendar-footer-link" href="https://github.com/aiirvizionz/CalendarIA" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
      </nav>
      <p class="calendar-footer-copy">© 2026 CalendarIA · David Alejandro Lopez Huerta</p>
    </div>`;
}

export function renderSharedFooter() {
  ensureFooterStyles();
  const existing = document.querySelector('.calendar-footer, .site-footer, .welcome-footer, .policy-footer');
  if (!existing) return;

  const footer = document.createElement('footer');
  footer.className = 'calendar-footer';
  footer.innerHTML = footerMarkup(currentRoute());
  existing.replaceWith(footer);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', renderSharedFooter, { once: true });
} else {
  renderSharedFooter();
}
