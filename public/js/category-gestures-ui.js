const SWIPE_REVEAL = 94;
const SWIPE_DELETE_MIN = 132;

function addStylesheet() {
  if (document.querySelector('link[data-category-gestures-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/category-gestures.css?v=3';
  link.dataset.categoryGesturesStyles = 'true';
  document.head.appendChild(link);
}

function closeOpenRows(except = null) {
  document.querySelectorAll('.event-category-row.is-swipe-open').forEach((row) => {
    if (row === except) return;
    const content = row.querySelector('.category-swipe-content');
    if (content) content.style.transform = 'translateX(0px)';
    row.classList.remove('is-swipe-open');
  });
}

function requestDelete(row, nativeDelete) {
  if (!nativeDelete || nativeDelete.disabled) {
    const content = row.querySelector('.category-swipe-content');
    if (content) content.style.transform = 'translateX(0px)';
    row.classList.remove('is-swipe-open');
    return;
  }

  const content = row.querySelector('.category-swipe-content');
  row.classList.add('is-removing');
  if (content) content.style.transform = 'translateX(-105%)';
  window.setTimeout(() => nativeDelete.click(), 170);
}

function bindSwipe(row, content, nativeDelete, deleteButton) {
  let gesture = null;
  let currentX = 0;

  const apply = (x, animate = true) => {
    currentX = x;
    content.classList.toggle('is-no-transition', !animate);
    content.style.transform = `translateX(${x}px)`;
    row.classList.toggle('is-swipe-open', x <= -44);
    if (!animate) requestAnimationFrame(() => content.classList.remove('is-no-transition'));
  };

  const reset = () => apply(0);
  const reveal = () => apply(-SWIPE_REVEAL);

  content.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('button, select, textarea, a, .event-category-drag-handle, .event-category-color-trigger')) return;
    if (event.pointerType === 'mouse' && event.target.closest('input')) return;

    closeOpenRows(row);
    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offset: row.classList.contains('is-swipe-open') ? -SWIPE_REVEAL : 0,
      horizontal: false,
    };
    try { content.setPointerCapture(event.pointerId); } catch { /* optional */ }
  });

  content.addEventListener('pointermove', (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;

    if (!gesture.horizontal) {
      if (Math.abs(dx) < 8) return;
      if (Math.abs(dx) <= Math.abs(dy) * 1.2) return;
      gesture.horizontal = true;
    }

    event.preventDefault();
    const maxLeft = Math.min(190, Math.max(SWIPE_DELETE_MIN, row.clientWidth * 0.45));
    const x = Math.max(-maxLeft, Math.min(8, gesture.offset + dx));
    apply(x, false);
  }, { passive: false });

  const finish = (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const wasHorizontal = gesture.horizontal;
    gesture = null;
    try { content.releasePointerCapture(event.pointerId); } catch { /* optional */ }
    content.classList.remove('is-no-transition');
    if (!wasHorizontal) return;

    const deleteThreshold = -Math.min(168, Math.max(SWIPE_DELETE_MIN, row.clientWidth * 0.38));
    if (currentX <= deleteThreshold && nativeDelete && !nativeDelete.disabled) requestDelete(row, nativeDelete);
    else if (currentX <= -44 && nativeDelete && !nativeDelete.disabled) reveal();
    else reset();
  };

  content.addEventListener('pointerup', finish);
  content.addEventListener('pointercancel', finish);
  deleteButton.addEventListener('click', () => requestDelete(row, nativeDelete));
}

function enhanceRow(row) {
  if (!row || row.dataset.compactGestureEnhanced === 'true') return;

  const handle = row.querySelector('.event-category-drag-handle');
  const fields = row.querySelector('.event-category-fields');
  const nativeDelete = row.querySelector('.event-category-delete');
  if (!handle || !fields || !nativeDelete) return;

  row.dataset.compactGestureEnhanced = 'true';
  row.classList.add('event-category-compact-row');

  handle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
  handle.title = 'Arrastra para reordenar la categoría';
  handle.setAttribute('aria-label', 'Arrastra para reordenar la categoría');

  const deleteLayer = document.createElement('div');
  deleteLayer.className = 'category-delete-layer';

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'category-delete-action';
  deleteButton.disabled = nativeDelete.disabled;
  deleteButton.setAttribute('aria-label', `Eliminar ${row.querySelector('.event-category-name')?.value || 'categoría'}`);
  deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2m-8 0 1 13h8l1-13M10 10v7m4-7v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Eliminar</span>';
  deleteLayer.appendChild(deleteButton);

  const content = document.createElement('div');
  content.className = 'category-swipe-content';
  content.append(fields, handle, nativeDelete);
  row.replaceChildren(deleteLayer, content);

  nativeDelete.classList.add('category-native-delete');
  nativeDelete.tabIndex = -1;
  nativeDelete.setAttribute('aria-hidden', 'true');

  const nameInput = row.querySelector('.event-category-name');
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      deleteButton.setAttribute('aria-label', `Eliminar ${nameInput.value || 'categoría'}`);
    });
  }

  bindSwipe(row, content, nativeDelete, deleteButton);
}

function enhanceRows() {
  document.querySelectorAll('.event-category-row').forEach(enhanceRow);
}

function initialize() {
  addStylesheet();
  enhanceRows();

  const observer = new MutationObserver(enhanceRows);
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.event-category-compact-row')) closeOpenRows();
  }, { capture: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}
