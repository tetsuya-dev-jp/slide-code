import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const api = vi.hoisted(() => ({
  createDeck: vi.fn(),
  createDeckFromTemplate: vi.fn(),
  deleteDeck: vi.fn(),
  deleteTemplatesFromDeck: vi.fn(),
  duplicateDeck: vi.fn(),
  getDeck: vi.fn(),
  listDeckIssues: vi.fn(),
  listDecks: vi.fn(),
  listTemplates: vi.fn(),
  saveTemplateFromDeck: vi.fn(),
  updateDeck: vi.fn(),
}));

const showToast = vi.hoisted(() => vi.fn());
const initDashboardConfigModal = vi.hoisted(() => vi.fn());
const initDashboardExportModal = vi.hoisted(() => vi.fn(() => ({ openExportModal: vi.fn() })));

vi.mock('../core/api.js', () => api);
vi.mock('../utils/helpers.js', async () => {
  const actual = await vi.importActual('../utils/helpers.js');
  return {
    ...actual,
    showToast,
  };
});
vi.mock('./dashboard-config-modal.js', () => ({ initDashboardConfigModal }));
vi.mock('./dashboard-export-modal.js', () => ({ initDashboardExportModal }));
vi.mock('./deck-import-normalize.js', () => ({ normalizeImportedDeck: vi.fn((value) => value) }));
vi.mock('./dashboard-template-state.js', () => ({
  applyTemplateButtonState: vi.fn(),
  collectSavedTemplateDeckIds: vi.fn(() => new Set()),
  parseTemplateSelection: vi.fn(() => null),
}));

const { initDashboard } = await import('./dashboard.js');

function flush() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function buildDom() {
  document.body.innerHTML = `
    <section id="deckIssues" hidden></section>
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
        <select id="deckExportFormat"></select>
        <button id="deckExportCancel" type="button">cancel</button>
      </form>
    </div>
  `;
}

beforeEach(() => {
  buildDom();
  initDashboardConfigModal.mockReset();
  initDashboardExportModal.mockReset();
  initDashboardExportModal.mockReturnValue({ openExportModal: vi.fn() });
  showToast.mockReset();
  api.createDeck.mockReset();
  api.createDeckFromTemplate.mockReset();
  api.deleteDeck.mockReset();
  api.deleteTemplatesFromDeck.mockReset();
  api.duplicateDeck.mockReset();
  api.getDeck.mockReset();
  api.listDeckIssues.mockReset();
  api.listDecks.mockReset();
  api.listTemplates.mockReset();
  api.saveTemplateFromDeck.mockReset();
  api.updateDeck.mockReset();
  api.listDeckIssues.mockResolvedValue([]);
  api.listTemplates.mockResolvedValue({ local: [], shared: [] });
});

afterEach(() => {
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
});
