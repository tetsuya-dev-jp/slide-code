import * as api from '../core/api.js';
import { createDeckFolderSlug, DECK_FOLDER_PATTERN, normalizeDeckFolderName } from '../core/deck-utils.js';
import { showToast, escapeHtml, formatCount, formatDate } from '../utils/helpers.js';
import { restoreFocus, trapFocusInModal } from '../utils/focus-trap.js';
import { initDashboardConfigModal } from './dashboard-config-modal.js';
import { initDashboardDeleteModal } from './dashboard-delete-modal.js';
import { initDashboardExportModal } from './dashboard-export-modal.js';
import { normalizeImportedDeck } from './deck-import-normalize.js';
import { applyTemplateButtonState, collectSavedTemplateDeckIds, parseTemplateSelection } from './dashboard-template-state.js';
import { getRecentDecks } from '../core/preferences.js';

export function initDashboard(router) {
  initDashboardConfigModal({ onSaved: show });
  const { confirmDelete } = initDashboardDeleteModal();
  const { openExportModal } = initDashboardExportModal();
  const deckIssuesEl = document.getElementById('deckIssues');
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
  const deckSearchInput = document.getElementById('deckSearchInput');
  const deckSortSelect = document.getElementById('deckSortSelect');
  const deckStatusFilter = document.getElementById('deckStatusFilter');
  const deckSummaryEl = document.getElementById('deckSummary');

  let editingDeckId = null;
  let autoSyncFolderName = true;
  let modalTriggerEl = null;
  let savedTemplateDeckIds = new Set();
  let showRequestId = 0;
  let allDecks = [];

  function getRecentDeckMap() {
    return new Map(getRecentDecks().map((entry) => [entry.id, entry]));
  }

  function compareDecks(sortBy, recentDeckMap) {
    return (left, right) => {
      if (sortBy === 'updated-asc') {
        return (left.updatedAt || 0) - (right.updatedAt || 0);
      }
      if (sortBy === 'title-asc') {
        return (left.title || '').localeCompare(right.title || '', 'ja');
      }
      if (sortBy === 'recent-opened') {
        const leftRecent = recentDeckMap.get(left.id)?.lastOpenedAt || 0;
        const rightRecent = recentDeckMap.get(right.id)?.lastOpenedAt || 0;
        if (leftRecent !== rightRecent) {
          return rightRecent - leftRecent;
        }
      }
      return (right.updatedAt || 0) - (left.updatedAt || 0);
    };
  }

  function getFilteredDecks() {
    const searchQuery = deckSearchInput?.value?.trim().toLowerCase() || '';
    const sortBy = deckSortSelect?.value || 'recent-opened';
    const filterBy = deckStatusFilter?.value || 'all';
    const recentDeckMap = getRecentDeckMap();

    return allDecks
      .filter((deck) => {
        if (filterBy === 'recent' && !recentDeckMap.has(deck.id)) {
          return false;
        }
        if (filterBy === 'templates' && !savedTemplateDeckIds.has(deck.id)) {
          return false;
        }
        if (!searchQuery) {
          return true;
        }

        const haystack = [deck.title, deck.description, deck.id]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(searchQuery);
      })
      .sort(compareDecks(sortBy, recentDeckMap));
  }

  function updateDeckSummary(filteredDecks) {
    if (!deckSummaryEl) return;

    if (!allDecks.length) {
      deckSummaryEl.textContent = '';
      return;
    }

    const total = allDecks.length;
    const filtered = filteredDecks.length;
    const recentCount = getRecentDecks().length;
    deckSummaryEl.textContent = filtered === total
      ? `${formatCount(total)}件のデッキ${recentCount ? ` / 最近開いた ${formatCount(recentCount)}件` : ''}`
      : `${formatCount(filtered)} / ${formatCount(total)}件を表示中`;
  }

  function refreshDeckGrid() {
    const filteredDecks = getFilteredDecks();
    updateDeckSummary(filteredDecks);
    renderDeckGrid(filteredDecks);
  }

  function getImportErrorMessage(error) {
    if (error instanceof SyntaxError) {
      return 'JSON の構文が不正なためインポートできません';
    }

    const message = typeof error?.message === 'string' ? error.message.trim() : '';
    if (message === 'invalid-deck') {
      return 'deck JSON の形式が不正です';
    }

    if (error?.status === 409) {
      return '同じフォルダ名のデッキが既に存在します';
    }

    if (error?.status === 400) {
      if (message === 'Invalid deck id') {
        return 'フォルダ名は英数字・ハイフン・アンダースコアのみ使用できます';
      }
      if (message === 'Unsupported deck schema version') {
        return '未対応の deck schema のためインポートできません';
      }
      if (message) {
        return `インポート内容が不正です: ${message}`;
      }
    }

    if (message) {
      return `インポートに失敗しました: ${message}`;
    }

    return 'インポートに失敗しました';
  }

  function getRequestErrorMessage(action, error) {
    if (error?.code === 'offline') {
      return `${action}に失敗しました。オフラインのため接続できません`;
    }
    if (error?.code === 'timeout' || error?.status === 408) {
      return `${action}に時間がかかっています。通信状況を確認して再試行してください`;
    }
    if (error?.status === 401) {
      return `${action}を続行できません。認証状態を確認してください`;
    }
    if (error?.status === 403) {
      return `${action}を行う権限がありません`;
    }
    if (error?.status === 404) {
      return `${action}対象が見つかりません`;
    }
    if (error?.status === 429) {
      return `${action}が集中しています。少し待ってから再試行してください`;
    }

    const detail = typeof error?.message === 'string' ? error.message.trim() : '';
    if (detail && !/^failed to /i.test(detail)) {
      return `${action}に失敗しました: ${detail}`;
    }
    return `${action}に失敗しました`;
  }

  function renderDeckLoadError(error) {
    const grid = document.getElementById('deckGrid');
    if (!grid) return;

    grid.innerHTML = renderDeckState({
      state: 'error',
      title: 'デッキを読み込めませんでした',
      description: getRequestErrorMessage('デッキの読み込み', error),
      actionLabel: '再読み込み',
      actionClassName: 'btn btn-secondary',
      actionId: 'retryDeckLoadBtn',
    });
    grid.querySelector('#retryDeckLoadBtn')?.addEventListener('click', () => {
      show();
    });
  }

  function renderDeckState({ state, title, description, actionLabel = '', actionClassName = 'btn btn-primary', actionId = '' }) {
    return `
      <section class="deck-state deck-state-${state}" role="status" aria-live="polite">
        <div class="deck-state-badge" aria-hidden="true">
          <span class="deck-state-glyph">${state === 'loading' ? '…' : state === 'error' ? '!' : '+'}</span>
        </div>
        <div class="deck-state-copy">
          <h3 class="deck-state-title">${escapeHtml(title)}</h3>
          <p class="deck-state-description">${escapeHtml(description)}</p>
        </div>
        ${actionLabel && actionId
          ? `<button class="${escapeHtml(actionClassName)}" id="${escapeHtml(actionId)}" type="button">${escapeHtml(actionLabel)}</button>`
          : ''}
      </section>`;
  }

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
    } catch (err) {
      showToast(getRequestErrorMessage('テンプレート一覧の取得', err));
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
      showToast(getRequestErrorMessage(editingDeckId ? '更新' : '作成', err));
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
    } catch (error) {
      showToast(getImportErrorMessage(error));
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
      showToast(getRequestErrorMessage('複製', err));
    }
  }

  async function handleDeleteDeck(id, title, triggerEl) {
    const confirmed = await confirmDelete(title, triggerEl);
    if (!confirmed) return;
    try {
      await api.deleteDeck(id);
      showToast('削除しました');
      show();
    } catch (err) {
      showToast(getRequestErrorMessage('削除', err));
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
        showToast(getRequestErrorMessage('テンプレート削除', err));
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
      showToast(getRequestErrorMessage('テンプレート保存', err));
      return false;
    }
  }

  function formatDeckIssueReason(reason) {
    const value = typeof reason === 'string' ? reason.trim() : '';
    if (!value) return '詳細不明の理由で隔離されました';
    if (value.startsWith('invalid-deck:')) return 'deck.json の読み込みに失敗したため隔離されました';
    if (value.startsWith('unsupported-schema:')) return '未対応の schemaVersion のため隔離されました';
    if (value === 'missing-quarantine-record') return '隔離記録が欠落しています';
    if (value === 'invalid-quarantine-record') return '隔離記録の読み込みに失敗しました';
    return value;
  }

  function renderDeckIssues(issues) {
    if (!deckIssuesEl) return;

    if (!Array.isArray(issues) || issues.length === 0) {
      deckIssuesEl.hidden = true;
      deckIssuesEl.innerHTML = '';
      return;
    }

    deckIssuesEl.hidden = false;
    deckIssuesEl.innerHTML = `
      <div class="deck-issues-header">
        <h3 class="deck-issues-title">要確認のデッキ</h3>
        <p class="deck-issues-subtitle">読み込めなかったデッキは quarantine に移動されています。</p>
      </div>
      <div class="deck-issues-list">
        ${issues.map((issue) => {
          const timestamp = issue?.quarantinedAt ? formatDate(issue.quarantinedAt) : '日時不明';
          return `
            <article class="deck-issue-card">
              <strong>${escapeHtml(issue?.deckId || 'unknown-deck')}</strong>
              <p>${escapeHtml(formatDeckIssueReason(issue?.reason))}</p>
              <div class="deck-issue-meta">隔離日時: ${escapeHtml(timestamp)}</div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderDeckGrid(decks) {
    const grid = document.getElementById('deckGrid');
    if (decks.length === 0) {
      grid.innerHTML = allDecks.length === 0
        ? renderDeckState({
          state: 'empty',
          title: 'まだデッキがありません',
          description: '最初のデッキを作成すると、編集とプレゼンの流れをすぐに始められます。',
          actionLabel: '最初のデッキを作成',
          actionId: 'createFirstDeckBtn',
        })
        : renderDeckState({
          state: 'empty',
          title: '条件に一致するデッキがありません',
          description: '検索語やフィルタ条件を変えると、別のデッキを表示できます。',
          actionLabel: '新規デッキを作成',
          actionId: 'createFirstDeckBtn',
        });
      grid.querySelector('#createFirstDeckBtn')?.addEventListener('click', () => {
        document.getElementById('newDeckBtn')?.click();
      });
      return;
    }

    grid.innerHTML = decks.map(deck => {
      const templateSaved = savedTemplateDeckIds.has(deck.id);
      return `
      <div class="deck-card" data-id="${deck.id}" role="button" tabindex="0" aria-label="デッキ「${escapeHtml(deck.title)}」を編集で開く">
        <div class="deck-card-body">
          <h3 class="deck-card-title" dir="auto">${escapeHtml(deck.title)}</h3>
          <p class="deck-card-desc" dir="auto">${escapeHtml(deck.description || '')}</p>
          <div class="deck-card-meta">
            <span class="deck-card-id">${escapeHtml(deck.id)}</span>
            <span>${formatCount(deck.slideCount)} スライド</span>
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
          <button class="btn-icon deck-delete" data-id="${deck.id}" data-title="${escapeHtml(deck.title)}" title="削除" aria-label="デッキ「${escapeHtml(deck.title)}」を削除">
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
        } catch (err) {
          showToast(getRequestErrorMessage('デッキ情報の取得', err));
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
      btn.addEventListener('click', () => handleDeleteDeck(btn.dataset.id, btn.getAttribute('data-title') || '', btn));
    });
  }

  [deckSearchInput, deckSortSelect, deckStatusFilter].forEach((control) => {
    control?.addEventListener('input', refreshDeckGrid);
    control?.addEventListener('change', refreshDeckGrid);
  });

  async function show() {
    const requestId = ++showRequestId;
    const grid = document.getElementById('deckGrid');
    grid.innerHTML = renderDeckState({
      state: 'loading',
      title: 'デッキを読み込み中',
      description: 'ローカルの deck とテンプレート情報を確認しています。',
    });
    if (deckSummaryEl) {
      deckSummaryEl.textContent = '';
    }
    renderDeckIssues([]);
    try {
      const [decks, issues, templates] = await Promise.all([
        api.listDecks(),
        api.listDeckIssues().catch(() => []),
        api.listTemplates().catch(() => null),
      ]);
      if (requestId !== showRequestId) return;
      allDecks = Array.isArray(decks) ? decks : [];
      savedTemplateDeckIds = collectSavedTemplateDeckIds(templates);
      renderDeckIssues(issues);
      refreshDeckGrid();
    } catch (err) {
      if (requestId !== showRequestId) return;
      allDecks = [];
      renderDeckIssues([]);
      renderDeckLoadError(err);
      console.error(err);
    }
  }

  return { show };
}
