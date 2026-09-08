const $ = (id) => document.getElementById(id);

function categoriesReady() {
  return Boolean(document.querySelector('#categoryOptions [data-event-type-choice="true"] input[name="category"]'));
}

function clearInitialCategoryPlaceholders() {
  const container = $('categoryOptions');
  if (container && !categoriesReady()) {
    container.replaceChildren();
  }

  const reviewSelect = $('reviewCategoryInput');
  if (reviewSelect && !categoriesReady()) {
    reviewSelect.replaceChildren();
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Cargando categorías…';
    option.selected = true;
    reviewSelect.appendChild(option);
    reviewSelect.disabled = true;
  }
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

  clearInitialCategoryPlaceholders();
  const observer = new MutationObserver(syncCategoryLoadingState);
  observer.observe(container, { childList: true, subtree: true });
  syncCategoryLoadingState();
}

if ($('categoryOptions')) {
  initialize();
} else {
  window.addEventListener('DOMContentLoaded', initialize, { once: true });
}
