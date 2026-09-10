const GOOGLE_EVENT_COLORS = Object.freeze({
  1: '#a4bdfc',
  2: '#7ae7bf',
  3: '#dbadff',
  4: '#ff887c',
  5: '#fbd75b',
  6: '#ffb878',
  7: '#46d6db',
  8: '#e1e1e1',
  9: '#5484ed',
  10: '#51b749',
  11: '#dc2127',
});

const state = {
  mode: 'list',
  month: startOfMonth(new Date()),
  selectedDate: '',
  monthCache: new Map(),
  monthRequests: new Map(),
  reloadTimer: null,
  preloadStarted: false,
};

function $(id) { return document.getElementById(id); }

function addStylesheet(href, marker) {
  if (document.querySelector(`link[data-${marker}]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset[marker] = 'true';
  document.head.appendChild(link);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function ymd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function eventDateKey(event) {
  if (event?.startDate) return String(event.startDate).slice(0, 10);
  if (!event?.startDateTime) return '';
  const parsed = new Date(event.startDateTime);
  return Number.isNaN(parsed.getTime()) ? '' : ymd(parsed);
}

function eventTimeLabel(event) {
  if (event?.startDate && !event?.startDateTime) return 'Todo el día';
  const parsed = new Date(event?.startDateTime || '');
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(parsed);
}

function currentMonthEvents() {
  return state.monthCache.get(monthKey(state.month)) || [];
}

function injectUI() {
  const headingActions = document.querySelector('.events-heading-actions');
  const eventsCard = document.querySelector('.events-card');
  const eventsList = $('eventsList');
  if (!headingActions || !eventsCard || !eventsList || $('eventsViewSwitch')) return;

  const switcher = document.createElement('div');
  switcher.id = 'eventsViewSwitch';
  switcher.className = 'events-view-switch';
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', 'Vista de eventos');
  switcher.innerHTML = `
    <button class="icon-button events-view-button is-active" type="button" data-events-view="list" aria-pressed="true" aria-label="Vista de lista" title="Lista">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
    <button class="icon-button events-view-button" type="button" data-events-view="calendar" aria-pressed="false" aria-label="Vista de calendario" title="Calendario">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    </button>`;
  headingActions.prepend(switcher);

  const calendarView = document.createElement('div');
  calendarView.id = 'eventsCalendarView';
  calendarView.className = 'events-calendar-view is-hidden';
  calendarView.innerHTML = `
    <div class="events-calendar-shell">
      <div class="events-calendar-toolbar">
        <button id="eventsCalendarPrev" class="events-calendar-nav" type="button" aria-label="Mes anterior">‹</button>
        <div id="eventsCalendarMonth" class="events-calendar-month"></div>
        <button id="eventsCalendarNext" class="events-calendar-nav" type="button" aria-label="Mes siguiente">›</button>
      </div>
      <div class="events-calendar-weekdays" aria-hidden="true">
        <span>Dom</span><span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span>
      </div>
      <div id="eventsCalendarGrid" class="events-calendar-grid"></div>
    </div>
    <div id="eventsCalendarDayEvents" class="events-calendar-day-events"></div>`;
  eventsCard.appendChild(calendarView);

  switcher.addEventListener('click', (event) => {
    const button = event.target.closest('[data-events-view]');
    if (!button) return;
    setMode(button.dataset.eventsView);
  });

  $('eventsCalendarPrev').addEventListener('click', () => moveMonth(-1));
  $('eventsCalendarNext').addEventListener('click', () => moveMonth(1));

  $('refreshEventsButton')?.addEventListener('click', () => {
    scheduleReload(550);
  });

  const observer = new MutationObserver(() => {
    if (state.preloadStarted) scheduleReload(700);
  });
  observer.observe(eventsList, { childList: true, subtree: true });
}

function setMode(mode) {
  if (!['list', 'calendar'].includes(mode)) return;
  state.mode = mode;
  document.querySelectorAll('[data-events-view]').forEach((button) => {
    const active = button.dataset.eventsView === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  const list = $('eventsList');
  const empty = $('emptyState');
  const calendar = $('eventsCalendarView');
  const isCalendar = mode === 'calendar';
  list?.classList.toggle('is-hidden', isCalendar);
  if (empty) {
    if (isCalendar) empty.classList.add('is-hidden');
    else empty.classList.toggle('is-hidden', Boolean(list?.children.length));
  }
  calendar?.classList.toggle('is-hidden', !isCalendar);

  if (isCalendar) {
    const key = monthKey(state.month);
    if (state.monthCache.has(key)) renderCalendar();
    else void loadMonth(state.month, { showLoading: true });
  }
}

function moveMonth(delta) {
  const current = startOfMonth(new Date());
  const next = new Date(state.month.getFullYear(), state.month.getMonth() + delta, 1);
  if (next < current) return;
  state.month = next;
  state.selectedDate = '';

  const key = monthKey(next);
  if (state.monthCache.has(key)) renderCalendar();
  else void loadMonth(next, { showLoading: true });

  const following = new Date(next.getFullYear(), next.getMonth() + 1, 1);
  void loadMonth(following, { showLoading: false });
}

function scheduleReload(delay = 400) {
  window.clearTimeout(state.reloadTimer);
  state.reloadTimer = window.setTimeout(() => {
    void loadMonth(state.month, { force: true, showLoading: false });
  }, delay);
}

function renderLoading() {
  if (state.mode !== 'calendar') return;
  const grid = $('eventsCalendarGrid');
  if (grid) grid.innerHTML = '<div class="events-calendar-loading" style="grid-column:1/-1">Actualizando calendario…</div>';
}

function renderLoadError() {
  if (state.mode !== 'calendar') return;
  const grid = $('eventsCalendarGrid');
  if (grid) grid.innerHTML = '<div class="events-calendar-empty" style="grid-column:1/-1">No se pudo actualizar este mes.</div>';
}

async function loadMonth(date, { force = false, showLoading = false } = {}) {
  const key = monthKey(date);
  if (state.monthRequests.has(key)) return state.monthRequests.get(key);
  if (!force && state.monthCache.has(key)) return state.monthCache.get(key);
  if (showLoading && !state.monthCache.has(key)) renderLoading();

  const request = (async () => {
    try {
      const response = await fetch(`/api/calendar/events?view=calendar&month=${encodeURIComponent(key)}`, {
        credentials: 'same-origin',
        headers: { 'X-Time-Zone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' },
      });
      if (!response.ok) throw new Error('No se pudieron cargar los eventos');
      const payload = await response.json();
      const events = Array.isArray(payload?.events) ? payload.events : [];
      state.monthCache.set(key, events);
      if (state.mode === 'calendar' && monthKey(state.month) === key) renderCalendar();
      return events;
    } catch (error) {
      if (state.mode === 'calendar' && monthKey(state.month) === key && !state.monthCache.has(key)) renderLoadError();
      throw error;
    } finally {
      state.monthRequests.delete(key);
    }
  })();

  state.monthRequests.set(key, request);
  return request;
}

function preloadCalendar() {
  if (state.preloadStarted) return;
  state.preloadStarted = true;
  const current = startOfMonth(new Date());
  const following = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  void loadMonth(current, { showLoading: false }).catch(() => {});
  void loadMonth(following, { showLoading: false }).catch(() => {});
}

function eventsByDate(events) {
  const map = new Map();
  for (const event of events) {
    const key = eventDateKey(event);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(event);
  }
  return map;
}

function renderCalendar() {
  const grid = $('eventsCalendarGrid');
  const monthLabel = $('eventsCalendarMonth');
  const previous = $('eventsCalendarPrev');
  if (!grid || !monthLabel || !previous) return;

  const currentMonth = startOfMonth(new Date());
  previous.disabled = state.month <= currentMonth;
  monthLabel.textContent = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(state.month);

  const grouped = eventsByDate(currentMonthEvents());
  const firstWeekday = state.month.getDay();
  const gridStart = new Date(state.month.getFullYear(), state.month.getMonth(), 1 - firstWeekday);
  const todayKey = ymd(new Date());
  grid.replaceChildren();

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    const key = ymd(date);
    const dayEvents = grouped.get(key) || [];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'events-calendar-day';
    button.classList.toggle('is-outside', date.getMonth() !== state.month.getMonth());
    button.classList.toggle('is-today', key === todayKey);
    button.classList.toggle('has-events', dayEvents.length > 0);
    button.classList.toggle('is-selected', key === state.selectedDate);
    button.disabled = dayEvents.length === 0;
    button.setAttribute('aria-label', dayEvents.length
      ? `${date.getDate()} de ${new Intl.DateTimeFormat('es-MX', { month: 'long' }).format(date)}, ${dayEvents.length} evento${dayEvents.length === 1 ? '' : 's'}`
      : `${date.getDate()} de ${new Intl.DateTimeFormat('es-MX', { month: 'long' }).format(date)}`);

    const number = document.createElement('span');
    number.textContent = String(date.getDate());
    button.appendChild(number);

    if (dayEvents.length) {
      const dots = document.createElement('span');
      dots.className = 'events-calendar-dots';
      dayEvents.slice(0, 3).forEach((event) => {
        const dot = document.createElement('i');
        dot.className = 'events-calendar-dot';
        dot.style.background = GOOGLE_EVENT_COLORS[Number(event.colorId)] || '#8f949b';
        dots.appendChild(dot);
      });
      button.appendChild(dots);
      if (dayEvents.length > 3) {
        const count = document.createElement('span');
        count.className = 'events-calendar-day-count';
        count.textContent = String(dayEvents.length);
        button.appendChild(count);
      }
      button.addEventListener('click', () => {
        state.selectedDate = key;
        renderCalendar();
      });
    }
    grid.appendChild(button);
  }

  renderSelectedDay(grouped.get(state.selectedDate) || []);
}

function renderSelectedDay(events) {
  const container = $('eventsCalendarDayEvents');
  if (!container) return;
  container.replaceChildren();
  for (const event of events) {
    const item = document.createElement('div');
    item.className = 'events-calendar-day-event';
    const accent = document.createElement('span');
    accent.className = 'events-calendar-day-event-accent';
    accent.style.background = GOOGLE_EVENT_COLORS[Number(event.colorId)] || '#8f949b';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = event.title || 'Sin título';
    const meta = document.createElement('span');
    meta.textContent = eventTimeLabel(event) || 'Google Calendar';
    copy.append(title, meta);
    item.append(accent, copy);
    container.appendChild(item);
  }
}

function enhanceDesktopColorPicker() {
  const options = $('eventCategoryColorOptions');
  const panel = document.querySelector('.event-category-color-panel');
  if (!options || !panel || panel.querySelector('.event-category-color-desktop-current')) return;

  const current = document.createElement('div');
  current.className = 'event-category-color-desktop-current';
  current.textContent = 'Color seleccionado';
  panel.appendChild(current);

  const update = () => {
    const selected = options.querySelector('.event-category-color-option.is-selected');
    const label = selected?.querySelector('.event-category-color-option-label')?.textContent?.trim() || 'Color seleccionado';
    const swatch = selected?.querySelector('.event-category-color-option-swatch');
    const color = swatch ? getComputedStyle(swatch).backgroundColor : '#5484ed';
    current.textContent = label;
    current.style.setProperty('--selected-color', color);
  };

  options.addEventListener('click', () => window.setTimeout(update, 0));
  new MutationObserver(update).observe(options, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  update();
}

function initialize() {
  addStylesheet('/events-view.css?v=4', 'eventsViewStyles');
  addStylesheet('/desktop-color-palette.css?v=2', 'desktopColorPaletteStyles');
  injectUI();
  preloadCalendar();

  const tryColorPicker = () => {
    enhanceDesktopColorPicker();
    if (!$('eventCategoryColorOptions')) window.setTimeout(tryColorPicker, 250);
  };
  tryColorPicker();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
