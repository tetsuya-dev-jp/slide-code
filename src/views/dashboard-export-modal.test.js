import { beforeEach, describe, expect, test, vi } from 'vitest';

const api = vi.hoisted(() => ({
  downloadDeckExport: vi.fn(),
  getDeckExportUrl: vi.fn(() => '/api/decks/deck-1/export/print'),
}));

const showToast = vi.hoisted(() => vi.fn());
const restoreFocus = vi.hoisted(() => vi.fn());
const trapFocusInModal = vi.hoisted(() => vi.fn());

vi.mock('../core/api.js', () => api);
vi.mock('../utils/helpers.js', () => ({ showToast }));
vi.mock('../utils/focus-trap.js', () => ({ restoreFocus, trapFocusInModal }));

const { initDashboardExportModal } = await import('./dashboard-export-modal.js');

function flush() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function buildDom() {
  document.body.innerHTML = `
    <button id="trigger" type="button">open</button>
    <div id="deckExportModal" hidden>
      <div>
        <form id="deckExportForm">
          <select id="deckExportFormat">
            <option value="html">HTML</option>
            <option value="print">Print</option>
            <option value="zip">ZIP</option>
          </select>
          <p id="deckExportFormatHint"></p>
          <div id="deckExportDetails"></div>
          <button id="deckExportCancel" type="button">cancel</button>
          <button id="deckExportSubmit" type="submit">export</button>
        </form>
      </div>
    </div>
  `;
}

describe('dashboard export modal', () => {
  beforeEach(() => {
    buildDom();
    api.downloadDeckExport.mockReset();
    api.getDeckExportUrl.mockReset();
    api.getDeckExportUrl.mockReturnValue('/api/decks/deck-1/export/print');
    restoreFocus.mockReset();
    showToast.mockReset();
    trapFocusInModal.mockReset();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:deck-export');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  test('keeps modal open when print export is blocked by popup settings', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { openExportModal } = initDashboardExportModal();

    openExportModal('deck-1', document.getElementById('trigger'));

    const formatEl = document.getElementById('deckExportFormat');
    formatEl.value = 'print';
    formatEl.dispatchEvent(new Event('change'));

    document.getElementById('deckExportForm').dispatchEvent(new Event('submit'));
    await flush();

    expect(showToast).toHaveBeenCalledWith('ポップアップがブロックされました。許可して再試行してください');
    expect(document.getElementById('deckExportModal').hidden).toBe(false);
    expect(document.getElementById('deckExportSubmit').disabled).toBe(false);
    expect(document.getElementById('deckExportCancel').disabled).toBe(false);
  });

  test('prevents duplicate submissions while an export is in flight', async () => {
    let resolveExport;
    api.downloadDeckExport.mockImplementation(() => new Promise((resolve) => {
      resolveExport = resolve;
    }));

    const { openExportModal } = initDashboardExportModal();
    openExportModal('deck-1', document.getElementById('trigger'));

    const formEl = document.getElementById('deckExportForm');
    formEl.dispatchEvent(new Event('submit'));
    formEl.dispatchEvent(new Event('submit'));
    await flush();

    expect(api.downloadDeckExport).toHaveBeenCalledTimes(1);
    expect(document.getElementById('deckExportModal').getAttribute('aria-busy')).toBe('true');
    expect(document.getElementById('deckExportSubmit').disabled).toBe(true);
    expect(document.getElementById('deckExportCancel').disabled).toBe(true);
    expect(document.getElementById('deckExportFormat').disabled).toBe(true);

    resolveExport({ blob: new Blob(['ok']), filename: 'deck.html' });
    await flush();

    expect(document.getElementById('deckExportModal').hidden).toBe(true);
    expect(showToast).toHaveBeenCalledWith('エクスポートしました');
  });

  test('keeps the modal open and shows a recoverable offline error', async () => {
    api.downloadDeckExport.mockRejectedValue(Object.assign(new Error('Offline'), { code: 'offline' }));
    const { openExportModal } = initDashboardExportModal();

    openExportModal('deck-1', document.getElementById('trigger'));
    document.getElementById('deckExportForm').dispatchEvent(new Event('submit'));
    await flush();

    expect(showToast).toHaveBeenCalledWith('オフラインのためエクスポートできません。接続を確認して再試行してください');
    expect(document.getElementById('deckExportModal').hidden).toBe(false);
    expect(document.getElementById('deckExportModal').getAttribute('aria-busy')).toBe('false');
    expect(document.getElementById('deckExportSubmit').disabled).toBe(false);
  });
});
