import { restoreFocus, trapFocusInModal } from '../utils/focus-trap.js';

export function initDashboardDeleteModal() {
  const modalEl = document.getElementById('deckDeleteModal');
  const titleEl = document.getElementById('deckDeleteTitle');
  const messageEl = document.getElementById('deckDeleteMessage');
  const cancelBtn = document.getElementById('deckDeleteCancel');
  const confirmBtn = document.getElementById('deckDeleteConfirm');

  if (!modalEl || !titleEl || !messageEl || !cancelBtn || !confirmBtn) {
    return {
      confirmDelete: async () => false,
    };
  }

  let resolver = null;
  let triggerEl = null;

  function closeModal(confirmed, { restore = true } = {}) {
    modalEl.hidden = true;
    const resolve = resolver;
    resolver = null;
    if (restore) {
      restoreFocus(triggerEl);
    }
    triggerEl = null;
    resolve?.(confirmed);
  }

  function openModal(deckTitle, nextTriggerEl = document.activeElement) {
    triggerEl = nextTriggerEl instanceof HTMLElement ? nextTriggerEl : null;
    titleEl.textContent = 'デッキを削除';
    messageEl.textContent = `「${deckTitle || 'このデッキ'}」を削除します。この操作は元に戻せません。`;
    modalEl.hidden = false;
    confirmBtn.focus();
    return new Promise((resolve) => {
      resolver = resolve;
    });
  }

  cancelBtn.addEventListener('click', () => closeModal(false));
  confirmBtn.addEventListener('click', () => closeModal(true, { restore: false }));
  modalEl.addEventListener('click', (event) => {
    if (event.target === modalEl) closeModal(false);
  });

  document.addEventListener('keydown', (event) => {
    if (modalEl.hidden) return;
    if (event.key === 'Escape') {
      closeModal(false);
      return;
    }
    trapFocusInModal(event, modalEl);
  });

  return {
    confirmDelete: openModal,
  };
}
