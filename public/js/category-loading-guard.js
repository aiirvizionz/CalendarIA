const $ = (id) => document.getElementById(id);

function categoriesReady() {
  return Boolean(document.querySelector('#categoryOptions input[name="category"]'));
}

function syncCategoryLoadingState() {
  const container = $('categoryOptions');
  if (!container) return;

  const ready = categoriesReady();
  container.classList.toggle('category-options-loading', !ready);
  container.setAttribute('aria-busy', String(!ready));

  if (ready) {
    container.removeAttribute('aria-label');
  } else {
    container.setAttribute('aria-label', 'Cargando categorías');
  }

  const manualSubmit = $('manualSubmitButton');
  if (manualSubmit) manualSubmit.disabled = !ready;

  const reviewSelect = $('reviewCategoryInput');
  if (reviewSelect) {
    reviewSelect.disabled = !ready;
    reviewSelect.setAttribute('aria-busy', String(!ready));
  }
}

function initialize() {
  const container = $('categoryOptions');
  if (!container) return;

  const observer = new MutationObserver(syncCategoryLoadingState);
  observer.observe(container, { childList: true, subtree: true });
  syncCategoryLoadingState();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}
