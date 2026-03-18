import * as api from '../core/api.js';
import { restoreFocus, trapFocusInModal } from '../utils/focus-trap.js';
import { showToast } from '../utils/helpers.js';

const EXPORT_FORMAT_DETAILS = {
  html: {
    hint: 'ブラウザで閲覧しやすい単一 HTML を出力します',
    title: 'HTML',
    description:
      'プレゼン内容を 1 ファイルにまとめて書き出します。共有やローカル確認に向いています。',
    bullets: ['画像アセットは埋め込みます', 'そのままブラウザで開けます'],
  },
  print: {
    hint: '印刷向けに整えたプレビューを別ウィンドウで開きます',
    title: '印刷プレビュー',
    description:
      '印刷や PDF 保存前の確認用ビューを開きます。ダウンロードではなく新しいウィンドウ表示です。',
    bullets: [
      'ブラウザの印刷機能と組み合わせて使います',
      'ポップアップがブロックされると開けません',
    ],
  },
  zip: {
    hint: 'deck.json・files・assets・HTML をまとめた ZIP を出力します',
    title: 'ZIP',
    description: '再配布やバックアップ向けに deck 一式をまとめて書き出します。',
    bullets: [
      'deck.json / files / assets を含みます',
      '埋め込みではなく相対ファイル構成で保存します',
    ],
  },
};

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
  const exportSubmitEl = document.getElementById('deckExportSubmit');
  const exportFormatHintEl = document.getElementById('deckExportFormatHint');
  const exportDetailsEl = document.getElementById('deckExportDetails');

  if (
    !exportModalEl ||
    !exportFormEl ||
    !exportFormatEl ||
    !exportCancelEl ||
    !exportSubmitEl ||
    !exportFormatHintEl ||
    !exportDetailsEl
  ) {
    return {
      openExportModal: () => {},
    };
  }

  let exportDeckId = null;
  let exportTriggerEl = null;
  let isExporting = false;

  function getExportErrorMessage(error) {
    if (error?.code === 'offline') {
      return 'オフラインのためエクスポートできません。接続を確認して再試行してください';
    }
    if (error?.code === 'timeout' || error?.status === 408) {
      return 'エクスポートに時間がかかっています。通信状況を確認して再試行してください';
    }
    if (error?.status === 404) {
      return 'エクスポート対象のデッキが見つかりません';
    }
    if (error?.status === 429) {
      return 'エクスポート要求が集中しています。少し待ってから再試行してください';
    }

    const detail = typeof error?.message === 'string' ? error.message.trim() : '';
    if (detail && !/^failed to /i.test(detail)) {
      return `エクスポートに失敗しました: ${detail}`;
    }
    return 'エクスポートに失敗しました';
  }

  function setExportPendingState(pending) {
    isExporting = pending;
    exportModalEl.setAttribute('aria-busy', pending ? 'true' : 'false');
    exportFormatEl.disabled = pending;
    exportCancelEl.disabled = pending;
    exportSubmitEl.disabled = pending;
    exportSubmitEl.textContent = pending ? 'エクスポート中...' : 'エクスポート';
  }

  function renderExportFormatDetails(format) {
    const details = EXPORT_FORMAT_DETAILS[format] || EXPORT_FORMAT_DETAILS.html;
    exportFormatHintEl.textContent = details.hint;
    exportDetailsEl.innerHTML = `
      <strong>${details.title}</strong>
      <p>${details.description}</p>
      <ul>
        ${details.bullets.map((bullet) => `<li>${bullet}</li>`).join('')}
      </ul>
    `;
  }

  async function exportDeck(id, format) {
    try {
      if (format === 'print') {
        const printUrl = api.getDeckExportUrl(id, 'print');
        const printWindow = window.open(printUrl, '_blank', 'noopener');
        if (!printWindow) {
          showToast('ポップアップがブロックされました。許可して再試行してください');
          return false;
        }
        printWindow.focus?.();
      } else {
        const exported = await api.downloadDeckExport(id, format);
        downloadBlob(exported.blob, exported.filename);
      }
      showToast('エクスポートしました');
      return true;
    } catch (error) {
      showToast(getExportErrorMessage(error));
      return false;
    }
  }

  function closeExportModal({ restore = true, force = false } = {}) {
    if (isExporting && !force) return false;
    exportModalEl.hidden = true;
    exportDeckId = null;
    if (restore) {
      restoreFocus(exportTriggerEl);
    }
    exportTriggerEl = null;
    return true;
  }

  function openExportModal(deckId, triggerEl = document.activeElement) {
    exportDeckId = deckId;
    exportTriggerEl = triggerEl instanceof HTMLElement ? triggerEl : null;
    exportFormatEl.value = 'html';
    setExportPendingState(false);
    renderExportFormatDetails('html');
    exportModalEl.hidden = false;
    exportFormatEl.focus();
  }

  exportFormatEl.addEventListener('change', () => {
    renderExportFormatDetails(exportFormatEl.value || 'html');
  });

  exportCancelEl.addEventListener('click', () => closeExportModal());
  exportModalEl.addEventListener('click', (event) => {
    if (event.target === exportModalEl) closeExportModal();
  });

  exportFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!exportDeckId || isExporting) return;
    const format = exportFormatEl.value || 'html';
    setExportPendingState(true);
    try {
      const exported = await exportDeck(exportDeckId, format);
      if (exported) {
        setExportPendingState(false);
        closeExportModal({ restore: false, force: true });
      } else {
        exportSubmitEl.focus();
      }
    } finally {
      if (!exportModalEl.hidden) {
        setExportPendingState(false);
      }
    }
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
