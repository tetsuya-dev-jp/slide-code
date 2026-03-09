import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const api = vi.hoisted(() => ({
  createDeck: vi.fn(),
  createDeckFromTemplate: vi.fn(),
  deleteDeck: vi.fn(),
  deleteTemplatesFromDeck: vi.fn(),
  downloadDeckExport: vi.fn(),
  duplicateDeck: vi.fn(),
  getDeckExportUrl: vi.fn(() => '/api/decks/deck-1/export/print'),
  getDeck: vi.fn(),
  listDeckIssues: vi.fn(),
  listDecks: vi.fn(),
  listTemplates: vi.fn(),
  saveTemplateFromDeck: vi.fn(),
  updateDeck: vi.fn(),
}));

const showToast = vi.hoisted(() => vi.fn());
const initDashboardConfigModal = vi.hoisted(() => vi.fn());

vi.mock('../core/api.js', () => api);
vi.mock('../utils/helpers.js', async () => {
  const actual = await vi.importActual('../utils/helpers.js');
  return {
    ...actual,
    showToast,
  };
});
vi.mock('./dashboard-config-modal.js', () => ({ initDashboardConfigModal }));
vi.mock('./deck-import-normalize.js', () => ({ normalizeImportedDeck: vi.fn((value) => value) }));
vi.mock('./dashboard-template-state.js', () => ({
  applyTemplateButtonState: vi.fn(),
  collectSavedTemplateDeckIds: vi.fn(() => new Set()),
  parseTemplateSelection: vi.fn(() => null),
}));
vi.mock('../core/preferences.js', () => ({
  getRecentDecks: vi.fn(() => []),
}));

const { initDashboard } = await import('./dashboard.js');

function flush() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function buildDom() {
  document.body.innerHTML = `
    <section id="deckIssues" hidden></section>
    <input id="deckSearchInput" type="search" />
    <select id="deckSortSelect">
      <option value="recent-opened">recent</option>
      <option value="updated-desc">updated desc</option>
      <option value="updated-asc">updated asc</option>
      <option value="title-asc">title asc</option>
    </select>
    <select id="deckStatusFilter">
      <option value="all">all</option>
      <option value="recent">recent</option>
      <option value="templates">templates</option>
    </select>
    <div id="deckSummary"></div>
    <div id="deckGrid"></div>
    <button id="newDeckBtn" type="button">new</button>
    <button id="importBtn" type="button">import</button>
    <input id="importFileInput" type="file" />
    <div id="deckModal" hidden>
      <div>
        <h3 id="deckModalTitle"></h3>
        <form id="deckModalForm">
          <div id="deckModalTemplateField"></div>
          <select id="deckModalTemplate"></select>
          <input id="deckModalName" type="text" />
          <input id="deckModalFolder" type="text" />
          <input id="deckModalDesc" type="text" />
          <button id="deckModalSubmit" type="submit">save</button>
          <button id="deckModalCancel" type="button">cancel</button>
        </form>
      </div>
    </div>
    <div id="deckDeleteModal" hidden>
      <div>
        <h3 id="deckDeleteTitle"></h3>
        <p id="deckDeleteMessage"></p>
        <button id="deckDeleteCancel" type="button">cancel</button>
        <button id="deckDeleteConfirm" type="button">confirm</button>
      </div>
    </div>
    <div id="deckExportModal" hidden>
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
  `;
}

beforeEach(() => {
  buildDom();
  initDashboardConfigModal.mockReset();
  showToast.mockReset();
  api.createDeck.mockReset();
  api.createDeckFromTemplate.mockReset();
  api.deleteDeck.mockReset();
  api.deleteTemplatesFromDeck.mockReset();
  api.downloadDeckExport.mockReset();
  api.duplicateDeck.mockReset();
  api.getDeckExportUrl.mockReset();
  api.getDeckExportUrl.mockReturnValue('/api/decks/deck-1/export/print');
  api.getDeck.mockReset();
  api.listDeckIssues.mockReset();
  api.listDecks.mockReset();
  api.listTemplates.mockReset();
  api.saveTemplateFromDeck.mockReset();
  api.updateDeck.mockReset();
  api.listDeckIssues.mockResolvedValue([]);
  api.listTemplates.mockResolvedValue({ local: [], shared: [] });
  api.downloadDeckExport.mockResolvedValue({ blob: new Blob(['ok']), filename: 'deck.html' });
  vi.spyOn(window, 'open').mockReturnValue({ focus: vi.fn() });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('dashboard', () => {
  test('uses a modal before deleting a deck', async () => {
    api.listDecks.mockResolvedValue([{ id: 'deck-1', title: 'Alpha', description: '', slideCount: 3, updatedAt: Date.now() }]);
    api.deleteDeck.mockResolvedValue({ ok: true });

    const router = { navigate: vi.fn() };
    const { show } = initDashboard(router);
    await show();
    await flush();

    document.querySelector('.deck-delete').click();
    expect(api.deleteDeck).not.toHaveBeenCalled();
    expect(document.getElementById('deckDeleteModal').hidden).toBe(false);
    expect(document.getElementById('deckDeleteMessage').textContent).toContain('Alpha');

    document.getElementById('deckDeleteConfirm').click();
    await flush();

    expect(api.deleteDeck).toHaveBeenCalledWith('deck-1');
    expect(showToast).toHaveBeenCalledWith('削除しました');
  });

  test('renders empty state action without inline onclick', async () => {
    api.listDecks.mockResolvedValue([]);

    const newDeckBtn = document.getElementById('newDeckBtn');
    const clickSpy = vi.fn();
    newDeckBtn.addEventListener('click', clickSpy);

    const { show } = initDashboard({ navigate: vi.fn() });
    await show();
    await flush();

    const cta = document.getElementById('createFirstDeckBtn');
    expect(cta).not.toBeNull();
    expect(cta.getAttribute('onclick')).toBeNull();

    cta.click();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test('shows detailed import errors for invalid json and deck conflicts', async () => {
    api.listDecks.mockResolvedValue([]);

    const { show } = initDashboard({ navigate: vi.fn() });
    await show();
    await flush();

    const importInput = document.getElementById('importFileInput');

    Object.defineProperty(importInput, 'files', {
      configurable: true,
      value: [{ name: 'broken.json', text: () => Promise.resolve('{') }],
    });

    importInput.dispatchEvent(new Event('change'));
    await flush();

    expect(showToast).toHaveBeenCalledWith('JSON の構文が不正なためインポートできません');

    api.createDeck.mockRejectedValueOnce(Object.assign(new Error('Deck folder already exists'), { status: 409 }));
    Object.defineProperty(importInput, 'files', {
      configurable: true,
      value: [{ name: 'deck.json', text: () => Promise.resolve('{"title":"Demo"}') }],
    });

    importInput.dispatchEvent(new Event('change'));
    await flush();

    expect(showToast).toHaveBeenCalledWith('同じフォルダ名のデッキが既に存在します');
  });

  test('updates export helper copy when format changes', async () => {
    api.listDecks.mockResolvedValue([{ id: 'deck-1', title: 'Alpha', description: '', slideCount: 3, updatedAt: Date.now() }]);

    const { show } = initDashboard({ navigate: vi.fn() });
    await show();
    await flush();

    document.querySelector('.deck-export').click();

    const hint = document.getElementById('deckExportFormatHint');
    const details = document.getElementById('deckExportDetails');
    const format = document.getElementById('deckExportFormat');

    expect(hint.textContent).toContain('単一 HTML');
    expect(details.textContent).toContain('画像アセットは埋め込みます');

    format.value = 'zip';
    format.dispatchEvent(new Event('change'));

    expect(hint.textContent).toContain('ZIP');
    expect(details.textContent).toContain('deck.json / files / assets');
  });

  test('filters and sorts dashboard decks on the client side', async () => {
    api.listDecks.mockResolvedValue([
      { id: 'beta', title: 'Beta Deck', description: 'second item', slideCount: 3, updatedAt: 20 },
      { id: 'alpha', title: 'Alpha Deck', description: 'first item', slideCount: 2, updatedAt: 10 },
    ]);

    const { getRecentDecks } = await import('../core/preferences.js');
    getRecentDecks.mockReturnValue([{ id: 'beta', title: 'Beta Deck', lastOpenedAt: 100 }]);

    const { show } = initDashboard({ navigate: vi.fn() });
    await show();
    await flush();

    const titles = [...document.querySelectorAll('.deck-card-title')].map((el) => el.textContent);
    expect(titles).toEqual(['Beta Deck', 'Alpha Deck']);
    expect(document.getElementById('deckSummary').textContent).toContain('最近開いた 1件');

    const search = document.getElementById('deckSearchInput');
    search.value = 'alpha';
    search.dispatchEvent(new Event('input'));

    expect([...document.querySelectorAll('.deck-card-title')].map((el) => el.textContent)).toEqual(['Alpha Deck']);
    expect(document.getElementById('deckSummary').textContent).toContain('1 / 2件');

    search.value = '';
    search.dispatchEvent(new Event('input'));

    const sort = document.getElementById('deckSortSelect');
    sort.value = 'title-asc';
    sort.dispatchEvent(new Event('change'));

    expect([...document.querySelectorAll('.deck-card-title')].map((el) => el.textContent)).toEqual(['Alpha Deck', 'Beta Deck']);

    const filter = document.getElementById('deckStatusFilter');
    filter.value = 'recent';
    filter.dispatchEvent(new Event('change'));

    expect([...document.querySelectorAll('.deck-card-title')].map((el) => el.textContent)).toEqual(['Beta Deck']);
  });

  test('renders recoverable load error state for offline failures', async () => {
    api.listDecks
      .mockRejectedValueOnce(Object.assign(new Error('Offline'), { code: 'offline' }))
      .mockResolvedValueOnce([]);

    const { show } = initDashboard({ navigate: vi.fn() });
    await show();
    await flush();

    expect(document.getElementById('deckGrid').textContent).toContain('オフラインのため接続できません');

    document.getElementById('retryDeckLoadBtn').click();
    await flush();

    expect(api.listDecks).toHaveBeenCalledTimes(2);
    expect(document.getElementById('retryDeckLoadBtn')).toBeNull();
  });
});
