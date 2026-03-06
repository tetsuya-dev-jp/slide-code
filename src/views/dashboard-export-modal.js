import * as api from '../core/api.js';
import { restoreFocus, trapFocusInModal } from '../utils/focus-trap.js';
import { showToast } from '../utils/helpers.js';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export function initDashboardExportModal() {
  const exportModalEl = document.getElementById('deckExportModal');
  const exportFormEl = document.getElementById('deckExportForm');
  const exportFormatEl = document.getElementById('deckExportFormat');
  const exportCancelEl = document.getElementById('deckExportCancel');

  if (!exportModalEl || !exportFormEl || !exportFormatEl || !exportCancelEl) {
    return {
      openExportModal: () => {},
    };
  }

  let exportDeckId = null;
  let exportTriggerEl = null;

  async function exportDeck(id, format) {
    try {
      if (format === 'print') {
        const printUrl = api.getDeckExportUrl(id, 'print');
        const printWindow = window.open(printUrl, '_blank', 'noopener');
        if (!printWindow) {
          showToast('ポップアップがブロックされました');
          return;
        }
      } else {
        const exported = await api.downloadDeckExport(id, format);
        downloadBlob(exported.blob, exported.filename);
      }
      showToast('エクスポートしました');
    } catch {
      showToast('エクスポートに失敗しました');
    }
  }

  function closeExportModal({ restore = true } = {}) {
    exportModalEl.hidden = true;
    exportDeckId = null;
    if (restore) {
      restoreFocus(exportTriggerEl);
    }
    exportTriggerEl = null;
  }

  function openExportModal(deckId, triggerEl = document.activeElement) {
    exportDeckId = deckId;
    exportTriggerEl = triggerEl instanceof HTMLElement ? triggerEl : null;
    exportFormatEl.value = 'html';
    exportModalEl.hidden = false;
    exportFormatEl.focus();
  }

  exportCancelEl.addEventListener('click', () => closeExportModal());
  exportModalEl.addEventListener('click', (event) => {
    if (event.target === exportModalEl) closeExportModal();
  });

  exportFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!exportDeckId) return;
    const format = exportFormatEl.value || 'html';
    await exportDeck(exportDeckId, format);
    closeExportModal({ restore: false });
  });

  document.addEventListener('keydown', (event) => {
    if (exportModalEl.hidden) return;
    if (event.key === 'Escape') {
      closeExportModal();
      return;
    }
    trapFocusInModal(event, exportModalEl);
  });

  return {
    openExportModal,
  };
}
