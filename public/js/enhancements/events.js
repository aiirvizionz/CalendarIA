import { deleteGoogleEvent, updateGoogleEvent } from '../api.js';
import { CATEGORY_META, enhancedState, getEvent, showToast } from './state.js';
import { fillBaseReview } from './forms.js';

function ensureDialog() {
  let dialog = document.getElementById('recurrenceScopeDialog'); if (dialog) return dialog;
  dialog = document.createElement('dialog'); dialog.id = 'recurrenceScopeDialog'; dialog.innerHTML = '<form method="dialog" class="composer-card"><h2>Evento recurrente</h2><p>¿Quieres aplicar el cambio solo a esta ocurrencia o a toda la serie?</p><div class="form-actions"><button value="instance" class="button button-secondary">Solo este evento</button><button value="series" class="button button-primary">Toda la serie</button><button value="cancel" class="button button-ghost">Cancelar</button></div></form>'; document.body.appendChild(dialog); return dialog;
}

export function chooseScope(event) {
  if (!event?.recurring) return Promise.resolve('instance'); const dialog = ensureDialog(); dialog.returnValue = 'cancel'; dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener('close', () => resolve(dialog.returnValue || 'cancel'), { once: true }));
}

function styleAndDecorateCards() {
  const filter = document.getElementById('calendarCategoryFilter')?.value || 'all';
  document.querySelectorAll('.event-card[data-event-id]').forEach((card) => {
    const event = getEvent(card.dataset.eventId); if (!event) return;
    const meta = CATEGORY_META[event.category] || CATEGORY_META.otro; card.style.borderInlineStart = `4px solid ${event.categoryColor || meta.color}`; card.hidden = filter !== 'all' && event.category !== filter;
    const category = card.querySelector('.event-category'); if (category) { category.textContent = event.recurring ? `${meta.label} · Recurrente` : meta.label; category.style.color = event.categoryColor || meta.color; }
    if (!card.querySelector('.edit-event')) { const open = card.querySelector('.open-event'); const button = document.createElement('button'); button.type = 'button'; button.className = 'button button-ghost edit-event'; button.textContent = 'Editar'; open?.insertAdjacentElement('beforebegin', button); }
  });
}

function installFilter() {
  if (document.getElementById('calendarCategoryFilter')) return;
  const count = document.getElementById('eventCount'); if (!count) return;
  const select = document.createElement('select'); select.id = 'calendarCategoryFilter'; select.setAttribute('aria-label', 'Filtrar por categoría'); select.innerHTML = `<option value="all">Todas las categorías</option>${Object.entries(CATEGORY_META).map(([key, meta]) => `<option value="${key}">${meta.label}</option>`).join('')}`;
  count.parentElement?.appendChild(select); select.addEventListener('change', styleAndDecorateCards);
}

export function installEventEnhancements() {
  installFilter(); styleAndDecorateCards();
  window.addEventListener('calendaria:events', () => setTimeout(styleAndDecorateCards, 0));
  const list = document.getElementById('eventsList'); new MutationObserver(styleAndDecorateCards).observe(list, { childList: true, subtree: true });
  list.addEventListener('click', async (click) => {
    const card = click.target.closest('.event-card'); if (!card) return; const event = getEvent(card.dataset.eventId); if (!event) return;
    if (click.target.closest('.edit-event')) {
      click.preventDefault(); click.stopImmediatePropagation(); const scope = await chooseScope(event); if (scope === 'cancel') return;
      enhancedState.editing = { id: scope === 'series' ? event.seriesId || event.deleteId : event.id, scope };
      fillBaseReview({ ...event, recurrence: scope === 'series' ? event.recurrence : null });
      document.querySelectorAll('#panelManual,#panelAi,#panelAudio').forEach((el) => el.classList.add('is-hidden')); document.getElementById('reviewPanel').classList.remove('is-hidden'); document.getElementById('reviewTitle').textContent = scope === 'series' ? 'Editar serie recurrente' : 'Editar evento';
    }
    if (click.target.closest('.delete-event')) {
      click.preventDefault(); click.stopImmediatePropagation(); const scope = await chooseScope(event); if (scope === 'cancel') return;
      const id = scope === 'series' ? event.seriesId || event.deleteId : event.id;
      try { await deleteGoogleEvent(id); showToast(scope === 'series' ? 'Serie eliminada de Google Calendar' : 'Evento eliminado de Google Calendar'); document.getElementById('refreshEventsButton')?.click(); }
      catch (error) { showToast(error.message, true); }
    }
  }, true);
}

export async function saveEdit(event) {
  if (!enhancedState.editing) return false;
  await updateGoogleEvent(enhancedState.editing.id, event); enhancedState.editing = null; showToast('Evento actualizado en Google Calendar'); document.getElementById('refreshEventsButton')?.click(); return true;
}
