import * as api from '../core/api.js';
import { createDeckFolderSlug, DECK_FOLDER_PATTERN, normalizeDeckFolderName } from '../core/deck-utils.js';
import { showToast, escapeHtml, formatDate } from '../utils/helpers.js';
import { restoreFocus, trapFocusInModal } from '../utils/focus-trap.js';
import { initDashboardConfigModal } from './dashboard-config-modal.js';
import { initDashboardExportModal } from './dashboard-export-modal.js';
import { normalizeImportedDeck } from './deck-import-normalize.js';
import { applyTemplateButtonState, collectSavedTemplateDeckIds, parseTemplateSelection } from './dashboard-template-state.js';

export function initDashboard(router) {
  initDashboardConfigModal({ onSaved: show });
  const { openExportModal } = initDashboardExportModal();
  const modalEl      = document.getElementById('deckModal');
  const modalTitle   = document.getElementById('deckModalTitle');
  const modalForm    = document.getElementById('deckModalForm');
  const modalName    = document.getElementById('deckModalName');
  const modalFolder  = document.getElementById('deckModalFolder');
  const modalDesc    = document.getElementById('deckModalDesc');
  const modalTemplateField = document.getElementById('deckModalTemplateField');
  const modalTemplate = document.getElementById('deckModalTemplate');
  const modalSubmit  = document.getElementById('deckModalSubmit');
  const modalCancel  = document.getElementById('deckModalCancel');

  let editingDeckId = null;
  let autoSyncFolderName = true;
  let modalTriggerEl = null;
  let savedTemplateDeckIds = new Set();
  let showRequestId = 0;

  async function loadTemplateOptions() {
    if (!modalTemplate) return;
    const baseOption = document.createElement('option');
    baseOption.value = '';
    baseOption.textContent = '空のデッキから作成';
    modalTemplate.innerHTML = '';
    modalTemplate.appendChild(baseOption);

    try {
      const templates = await api.listTemplates();
      const localTemplates = Array.isArray(templates?.local) ? templates.local : [];
      const sharedTemplates = Array.isArray(templates?.shared) ? templates.shared : [];

      const appendGroup = (label, source, items) => {
        if (!items.length) return;
        const groupEl = document.createElement('optgroup');
        groupEl.label = label;
        items.forEach((template) => {
          const optionEl = document.createElement('option');
          optionEl.value = `${source}:${template.id}`;
          optionEl.textContent = template.title || template.id;
          groupEl.appendChild(optionEl);
        });
        modalTemplate.appendChild(groupEl);
      };

      appendGroup('ローカルテンプレート', 'local', localTemplates);
      appendGroup('共有テンプレート', 'shared', sharedTemplates);
    } catch {
      showToast('テンプレート一覧の取得に失敗しました');
    }
  }
  function openModal(mode, deckData, triggerEl = document.activeElement) {
    modalTriggerEl = triggerEl instanceof HTMLElement ? triggerEl : null;
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
    if (modalTemplateField) {
      modalTemplateField.hidden = mode === 'edit';
    }
    if (modalTemplate) {
      modalTemplate.value = '';
      if (mode !== 'edit') {
        loadTemplateOptions();
      }
    }
    modalName.classList.remove('modal-input-error');
    modalFolder.classList.remove('modal-input-error');
    modalEl.hidden = false;
    modalName.focus();
  }

  function closeModal({ restore = true } = {}) {
    modalEl.hidden = true;
    editingDeckId = null;
    autoSyncFolderName = true;
    modalForm.reset();
    if (restore) {
      restoreFocus(modalTriggerEl);
    }
    modalTriggerEl = null;
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
    if (modalEl.hidden) return;
    if (e.key === 'Escape') {
      closeModal();
      return;
    }
    trapFocusInModal(e, modalEl);
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
    const selectedTemplate = parseTemplateSelection(modalTemplate?.value || '');

    try {
      if (editingDeckId) {
        const updated = await api.updateDeck(editingDeckId, {
          id: folderName,
          title,
          description,
        });
        showToast(updated.id !== editingDeckId ? 'デッキ情報とフォルダ名を更新しました' : 'デッキ情報を更新しました');
        closeModal({ restore: false });
        show();
      } else {
        const deck = selectedTemplate
          ? await api.createDeckFromTemplate({
            ...selectedTemplate,
            id: folderName,
            title,
            description,
          })
          : await api.createDeck({
            id: folderName,
            title,
            description,
          });
        closeModal({ restore: false });
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

  document.getElementById('newDeckBtn').addEventListener('click', (event) => {
    openModal('create', {}, event.currentTarget);
  });

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
  async function handleDuplicateDeck(id) {
    try {
      const duplicated = await api.duplicateDeck(id);
      showToast(`「${duplicated.title}」を複製しました`);
      show();
    } catch (err) {
      if (err?.status === 404) {
        showToast('複製元のデッキが見つかりません');
        return;
      }
      if (err?.status === 409) {
        showToast('複製先のフォルダ名が衝突しました。再試行してください');
        return;
      }
      showToast('複製に失敗しました');
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

  async function handleToggleTemplate(id) {
    if (savedTemplateDeckIds.has(id)) {
      try {
        const deleted = await api.deleteTemplatesFromDeck(id);
        savedTemplateDeckIds.delete(id);
        const removedCount = Number.isFinite(deleted?.removedCount) ? deleted.removedCount : 0;
        showToast(removedCount > 0 ? 'テンプレートを削除しました' : 'テンプレートは既にありません');
        return false;
      } catch (err) {
        if (err?.status === 404) {
          savedTemplateDeckIds.delete(id);
          showToast('テンプレートは既にありません');
          return false;
        }
        showToast('テンプレート削除に失敗しました');
        return true;
      }
    }

    try {
      const template = await api.saveTemplateFromDeck(id);
      savedTemplateDeckIds.add(id);
      showToast(`テンプレート「${template.title}」を保存しました`);
      return true;
    } catch (err) {
      if (err?.status === 409) {
        savedTemplateDeckIds.add(id);
        showToast('このデッキは既にテンプレート保存済みです');
        return true;
      }
      showToast('テンプレート保存に失敗しました');
      return false;
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

    grid.innerHTML = decks.map(deck => {
      const templateSaved = savedTemplateDeckIds.has(deck.id);
      return `
      <div class="deck-card" data-id="${deck.id}" role="button" tabindex="0" aria-label="デッキ「${escapeHtml(deck.title)}」を編集で開く">
        <div class="deck-card-body">
          <h3 class="deck-card-title">${escapeHtml(deck.title)}</h3>
          <p class="deck-card-desc">${escapeHtml(deck.description || '')}</p>
          <div class="deck-card-meta">
            <span>${deck.slideCount} スライド</span>
            <span>${formatDate(deck.updatedAt)}</span>
          </div>
        </div>
        <div class="deck-card-actions">
          <button class="btn-icon deck-open" data-id="${deck.id}" title="開く" aria-label="デッキ「${escapeHtml(deck.title)}」を開く">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </button>
          <button class="btn-icon deck-edit" data-id="${deck.id}" title="編集" aria-label="デッキ「${escapeHtml(deck.title)}」を編集">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="btn-icon deck-duplicate" data-id="${deck.id}" title="複製" aria-label="デッキ「${escapeHtml(deck.title)}」を複製">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button class="btn-icon deck-template ${templateSaved ? 'is-saved' : ''}" data-id="${deck.id}" data-title="${escapeHtml(deck.title)}" title="${templateSaved ? 'テンプレート保存済み（クリックで削除）' : 'テンプレート保存'}" aria-label="${templateSaved ? `デッキ「${escapeHtml(deck.title)}」のテンプレートを削除` : `デッキ「${escapeHtml(deck.title)}」をテンプレートとして保存`}" aria-pressed="${templateSaved ? 'true' : 'false'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
          </button>
          <button class="btn-icon deck-export" data-id="${deck.id}" title="エクスポート" aria-label="デッキ「${escapeHtml(deck.title)}」をエクスポート">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          </button>
          <button class="btn-icon deck-delete" data-id="${deck.id}" title="削除" aria-label="デッキ「${escapeHtml(deck.title)}」を削除">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `;
    }).join('');

    grid.querySelectorAll('.deck-card').forEach(card => {
      card.addEventListener('click', (event) => {
        if (event.target.closest('.deck-card-actions')) return;
        router.navigate(`/deck/${card.dataset.id}/edit`);
      });
      card.addEventListener('keydown', (event) => {
        if (event.target.closest('.deck-card-actions')) return;
        if (!['Enter', ' ', 'Spacebar'].includes(event.key)) return;
        event.preventDefault();
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
          openModal('edit', deck, btn);
        } catch {
          showToast('デッキ情報の取得に失敗しました');
        }
      });
    });
    grid.querySelectorAll('.deck-duplicate').forEach(btn => {
      btn.addEventListener('click', () => handleDuplicateDeck(btn.dataset.id));
    });
    grid.querySelectorAll('.deck-template').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nextSaved = await handleToggleTemplate(btn.dataset.id);
        applyTemplateButtonState(btn, nextSaved);
      });
    });
    grid.querySelectorAll('.deck-export').forEach(btn => {
      btn.addEventListener('click', () => openExportModal(btn.dataset.id, btn));
    });
    grid.querySelectorAll('.deck-delete').forEach(btn => {
      btn.addEventListener('click', () => handleDeleteDeck(btn.dataset.id));
    });
  }

  async function show() {
    const requestId = ++showRequestId;
    const grid = document.getElementById('deckGrid');
    grid.innerHTML = '<div class="deck-loading">読み込み中...</div>';
    try {
      const [decks, templates] = await Promise.all([
        api.listDecks(),
        api.listTemplates().catch(() => null),
      ]);
      if (requestId !== showRequestId) return;
      savedTemplateDeckIds = collectSavedTemplateDeckIds(templates);
      renderDeckGrid(decks);
    } catch (err) {
      if (requestId !== showRequestId) return;
      grid.innerHTML = '<div class="deck-error">デッキの読み込みに失敗しました</div>';
      console.error(err);
    }
  }

  return { show };
}
