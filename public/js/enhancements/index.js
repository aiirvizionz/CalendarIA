import { createGoogleEvent, disconnectGoogle } from '../api.js';
import { enhancedState, showToast } from './state.js';
import { eventFromForm, installFormEnhancements, populateReview } from './forms.js';
import { installEventEnhancements, saveEdit } from './events.js';

function validate(event) {
  if (!event.title || event.title.length > 120) throw new Error('Escribe un título válido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) throw new Error('Selecciona una fecha válida');
  if (!event.allDay && !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time)) throw new Error('Selecciona una hora válida');
  if (!event.reminders.length) event.reminders = [10];
  return event;
}

function installDisconnect() {
  if (document.getElementById('disconnectGoogleButton')) return;
  const auth = document.getElementById('authButton'); if (!auth) return;
  const button = document.createElement('button'); button.id = 'disconnectGoogleButton'; button.type = 'button'; button.className = 'button button-ghost'; button.textContent = 'Desconectar Google'; auth.insertAdjacentElement('afterend', button);
  button.addEventListener('click', async () => { if (!confirm('¿Revocar el acceso de CalendarIA a Google?')) return; try { await disconnectGoogle(); location.reload(); } catch (error) { showToast(error.message, true); } });
}

function installCaptureHandlers() {
  document.getElementById('manualForm')?.addEventListener('submit', async (submit) => {
    submit.preventDefault(); submit.stopImmediatePropagation();
    try { await createGoogleEvent(validate(eventFromForm('manual'))); showToast('Evento guardado en Google Calendar'); document.getElementById('manualTitle').value = ''; document.getElementById('refreshEventsButton')?.click(); }
    catch (error) { showToast(error.message, true); }
  }, true);
  document.getElementById('confirmReviewButton')?.addEventListener('click', async (click) => {
    if (!enhancedState.lastAiEvent && !enhancedState.editing) return;
    click.preventDefault(); click.stopImmediatePropagation();
    try {
      const event = validate(eventFromForm('review'));
      if (!(await saveEdit(event))) { await createGoogleEvent(event); showToast('Evento guardado en Google Calendar'); enhancedState.lastAiEvent = null; }
      document.getElementById('reviewPanel').classList.add('is-hidden'); document.getElementById('refreshEventsButton')?.click();
    } catch (error) { showToast(error.message, true); }
  }, true);
}

function observeProposal() {
  const review = document.getElementById('reviewPanel'); if (!review) return;
  const apply = () => { if (!review.classList.contains('is-hidden') && enhancedState.lastAiEvent && !enhancedState.editing) populateReview(enhancedState.lastAiEvent); };
  window.addEventListener('calendaria:proposal', () => setTimeout(apply, 0)); new MutationObserver(apply).observe(review, { attributes: true, attributeFilter: ['class'] });
}

function installPwa() {
  if (!document.querySelector('link[rel="manifest"]')) { const link = document.createElement('link'); link.rel = 'manifest'; link.href = '/manifest.webmanifest'; document.head.appendChild(link); }
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => {}));
}

installFormEnhancements(); installDisconnect(); installCaptureHandlers(); observeProposal(); installPwa();
window.addEventListener('DOMContentLoaded', installEventEnhancements, { once: true });
