/**
 * Dashboard View
 * Displays deck list with CRUD operations
 */

import * as api from '../core/api.js';
import { showToast, escapeHtml, formatDate } from '../utils/helpers.js';
import { initDashboardConfigModal } from './dashboard-config-modal.js';

const DECK_FOLDER_PATTERN = /^[a-zA-Z0-9_-]+$/;

function normalizeDeckFolderName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, '-');
}

function createDeckFolderSlug(seed) {
  const base = normalizeDeckFolderName(seed)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');

  if (base) return base;
  return `deck-${Date.now().toString(36)}`;
}

export function initDashboard(router) {
  initDashboardConfigModal({ onSaved: show });

  function normalizeImportedDeck(data, filename) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('invalid-deck');
    }

    const fallbackTitle = filename.replace(/\.json$/i, '') || 'インポートしたデッキ';
    const title = typeof data.title === 'string' && data.title.trim()
      ? data.title.trim()
      : fallbackTitle;
    const description = typeof data.description === 'string' ? data.description : '';
    const terminalCwd = typeof data.terminal?.cwd === 'string'
      ? data.terminal.cwd.trim()
      : '';

    const normalizedFiles = Array.isArray(data.files)
      ? data.files
        .filter(file => file && typeof file === 'object')
        .map((file, index) => {
          const fallbackName = index === 0 ? 'main.py' : `file${index + 1}.txt`;
          return {
            name: typeof file.name === 'string' && file.name.trim() ? file.name.trim() : fallbackName,
            language: typeof file.language === 'string' && file.language.trim() ? file.language.trim() : 'plaintext',
            code: typeof file.code === 'string' ? file.code : '',
          };
        })
      : [];

    if (normalizedFiles.length === 0) {
      normalizedFiles.push({ name: 'main.py', language: 'python', code: '' });
    }

    const fileNames = new Set(normalizedFiles.map(file => file.name));
    const fallbackFileRef = normalizedFiles[0].name;

    const normalizeLineRange = (lineRange) => {
      let start = parseInt(Array.isArray(lineRange) ? lineRange[0] : undefined, 10);
      let end = parseInt(Array.isArray(lineRange) ? lineRange[1] : undefined, 10);
      if (!Number.isFinite(start) || start < 1) start = 1;
      if (!Number.isFinite(end) || end < start) end = start;
      return [start, end];
    };

    const normalizedSlides = Array.isArray(data.slides)
      ? data.slides
        .filter(slide => slide && typeof slide === 'object')
        .map((slide, index) => {
          const fileRef = typeof slide.fileRef === 'string' && fileNames.has(slide.fileRef)
            ? slide.fileRef
            : fallbackFileRef;
          const lineRange = normalizeLineRange(slide.lineRange);
          const highlightLines = Array.isArray(slide.highlightLines)
            ? slide.highlightLines
              .map(line => parseInt(line, 10))
              .filter(line => Number.isFinite(line) && line >= lineRange[0] && line <= lineRange[1])
            : [];

          return {
            title: typeof slide.title === 'string' && slide.title.trim() ? slide.title.trim() : `スライド ${index + 1}`,
            fileRef,
            lineRange,
            highlightLines,
            markdown: typeof slide.markdown === 'string' ? slide.markdown : '',
          };
        })
      : [];

    if (normalizedSlides.length === 0) {
      normalizedSlides.push({
        title: 'スライド 1',
        fileRef: fallbackFileRef,
        lineRange: [1, 1],
        highlightLines: [],
        markdown: '',
      });
    }

    return {
      title,
      description,
      files: normalizedFiles,
      slides: normalizedSlides,
      terminal: {
        cwd: terminalCwd,
      },
    };
  }

  // --------------- Deck Modal ---------------
  const modalEl      = document.getElementById('deckModal');
  const modalTitle   = document.getElementById('deckModalTitle');
  const modalForm    = document.getElementById('deckModalForm');
  const modalName    = document.getElementById('deckModalName');
  const modalFolder  = document.getElementById('deckModalFolder');
  const modalDesc    = document.getElementById('deckModalDesc');
  const modalSubmit  = document.getElementById('deckModalSubmit');
  const modalCancel  = document.getElementById('deckModalCancel');

  /** @type {string|null} deck id when editing, null for create */
  let editingDeckId = null;
  let autoSyncFolderName = true;

  function openModal(mode, deckData) {
    editingDeckId = mode === 'edit' ? deckData.id : null;
    autoSyncFolderName = mode !== 'edit';
    modalTitle.textContent = mode === 'edit' ? 'デッキ情報を編集' : '新規デッキ';
    modalSubmit.textContent = mode === 'edit' ? '保存' : '作成';
    const currentTitle = deckData?.title || '';
    modalName.value = currentTitle;
    modalFolder.value = mode === 'edit'
      ? (deckData?.id || '')
      : createDeckFolderSlug(currentTitle || 'deck');
    modalDesc.value = deckData?.description || '';
    modalName.classList.remove('modal-input-error');
    modalFolder.classList.remove('modal-input-error');
    modalEl.hidden = false;
    modalName.focus();
  }

  function closeModal() {
    modalEl.hidden = true;
    editingDeckId = null;
    autoSyncFolderName = true;
    modalForm.reset();
  }

  modalName.addEventListener('input', () => {
    modalName.classList.remove('modal-input-error');
    if (!editingDeckId && autoSyncFolderName) {
      modalFolder.value = createDeckFolderSlug(modalName.value || 'deck');
    }
  });

  modalFolder.addEventListener('input', () => {
    modalFolder.classList.remove('modal-input-error');
    if (!editingDeckId) autoSyncFolderName = false;
  });

  modalCancel.addEventListener('click', closeModal);
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalEl.hidden) closeModal();
  });

  modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = modalName.value.trim();
    if (!title) {
      modalName.classList.add('modal-input-error');
      modalName.focus();
      return;
    }
    modalName.classList.remove('modal-input-error');

    const folderName = normalizeDeckFolderName(modalFolder.value);
    if (!DECK_FOLDER_PATTERN.test(folderName)) {
      modalFolder.classList.add('modal-input-error');
      modalFolder.focus();
      return;
    }
    modalFolder.classList.remove('modal-input-error');

    const description = modalDesc.value.trim();

    try {
      if (editingDeckId) {
        const updated = await api.updateDeck(editingDeckId, {
          id: folderName,
          title,
          description,
        });
        showToast(updated.id !== editingDeckId ? 'デッキ情報とフォルダ名を更新しました' : 'デッキ情報を更新しました');
        closeModal();
        show();
      } else {
        const deck = await api.createDeck({
          id: folderName,
          title,
          description,
        });
        closeModal();
        router.navigate(`/deck/${deck.id}/edit`);
      }
    } catch (err) {
      if (err?.status === 409) {
        showToast('そのフォルダ名は既に使用されています');
        modalFolder.classList.add('modal-input-error');
        modalFolder.focus();
        return;
      }
      if (err?.status === 400) {
        showToast('フォルダ名は英数字・ハイフン・アンダースコアのみ使用できます');
        modalFolder.classList.add('modal-input-error');
        modalFolder.focus();
        return;
      }
      showToast(editingDeckId ? '更新に失敗しました' : '作成に失敗しました');
    }
  });

  // New deck button → open create modal
  document.getElementById('newDeckBtn').addEventListener('click', () => {
    openModal('create', {});
  });

  // Import button
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });

  document.getElementById('importFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const normalizedDeck = normalizeImportedDeck(data, file.name);
      await api.createDeck(normalizedDeck);
      showToast('インポートしました');
      show();
    } catch {
      showToast('インポートに失敗しました');
    }
    e.target.value = '';
  });

  async function exportDeck(id) {
    try {
      const deck = await api.getDeck(id);
      const blob = new Blob([JSON.stringify(deck, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${deck.title || 'deck'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('エクスポートしました');
    } catch {
      showToast('エクスポートに失敗しました');
    }
  }

  async function handleDeleteDeck(id) {
    if (!confirm('このデッキを削除しますか？')) return;
    try {
      await api.deleteDeck(id);
      showToast('削除しました');
      show();
    } catch {
      showToast('削除に失敗しました');
    }
  }

  function renderDeckGrid(decks) {
    const grid = document.getElementById('deckGrid');
    if (decks.length === 0) {
      grid.innerHTML = `
        <div class="deck-empty">
          <p>まだデッキがありません</p>
          <button class="btn btn-primary" onclick="document.getElementById('newDeckBtn').click()">最初のデッキを作成</button>
        </div>`;
      return;
    }

    grid.innerHTML = decks.map(deck => `
      <div class="deck-card" data-id="${deck.id}">
        <div class="deck-card-body">
          <h3 class="deck-card-title">${escapeHtml(deck.title)}</h3>
          <p class="deck-card-desc">${escapeHtml(deck.description || '')}</p>
          <div class="deck-card-meta">
            <span>${deck.slideCount} スライド</span>
            <span>${formatDate(deck.updatedAt)}</span>
          </div>
        </div>
        <div class="deck-card-actions">
          <button class="btn-icon deck-open" data-id="${deck.id}" title="開く">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </button>
          <button class="btn-icon deck-edit" data-id="${deck.id}" title="編集">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="btn-icon deck-export" data-id="${deck.id}" title="エクスポート">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          </button>
          <button class="btn-icon deck-delete" data-id="${deck.id}" title="削除">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.deck-card').forEach(card => {
      card.addEventListener('click', (event) => {
        if (event.target.closest('.deck-card-actions')) return;
        router.navigate(`/deck/${card.dataset.id}/edit`);
      });
    });

    grid.querySelectorAll('.deck-open').forEach(btn => {
      btn.addEventListener('click', () => router.navigate(`/deck/${btn.dataset.id}`));
    });
    grid.querySelectorAll('.deck-edit').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const deck = await api.getDeck(btn.dataset.id);
          openModal('edit', deck);
        } catch {
          showToast('デッキ情報の取得に失敗しました');
        }
      });
    });
    grid.querySelectorAll('.deck-export').forEach(btn => {
      btn.addEventListener('click', () => exportDeck(btn.dataset.id));
    });
    grid.querySelectorAll('.deck-delete').forEach(btn => {
      btn.addEventListener('click', () => handleDeleteDeck(btn.dataset.id));
    });
  }

  async function show() {
    const grid = document.getElementById('deckGrid');
    grid.innerHTML = '<div class="deck-loading">読み込み中...</div>';
    try {
      const decks = await api.listDecks();
      renderDeckGrid(decks);
    } catch (err) {
      grid.innerHTML = '<div class="deck-error">デッキの読み込みに失敗しました</div>';
      console.error(err);
    }
  }

  return { show };
}
