import {
  DECK_FOLDER_PATTERN,
  formatRelativeDirectoryDisplay,
  normalizeDeckFolderName,
  normalizeRelativeDirectory,
} from '../core/deck-utils.js';
import { escapeHtml } from '../utils/helpers.js';

export function initEditorDeckSettings({
  api,
  showToast,
  restoreFocus,
  trapFocusInModal,
  getDeck,
  markDirty,
  setEditorDeckName,
}) {
  const deckSettingsModal = {
    modalEl: document.getElementById('editorDeckSettingsModal'),
    formEl: document.getElementById('editorDeckSettingsForm'),
    titleEl: document.getElementById('editorDeckSettingsName'),
    folderEl: document.getElementById('editorDeckSettingsFolder'),
    descEl: document.getElementById('editorDeckSettingsDesc'),
    cwdEl: document.getElementById('editorDeckSettingsCwd'),
    pickCwdBtn: document.getElementById('editorDeckSettingsPickCwdBtn'),
    cancelBtn: document.getElementById('editorDeckSettingsCancel'),
    submitBtn: document.getElementById('editorDeckSettingsSubmit'),
    openBtn: document.getElementById('editorDeckSettingsBtn'),
  };

  const cwdPicker = {
    modalEl: document.getElementById('cwdPickerModal'),
    currentEl: document.getElementById('cwdPickerCurrent'),
    listEl: document.getElementById('cwdPickerList'),
    homeBtn: document.getElementById('cwdPickerHomeBtn'),
    upBtn: document.getElementById('cwdPickerUpBtn'),
    cancelBtn: document.getElementById('cwdPickerCancel'),
    selectBtn: document.getElementById('cwdPickerSelect'),
    currentPath: '',
    parentPath: null,
    targetInputEl: null,
  };

  let deckSettingsTriggerEl = null;
  let cwdPickerTriggerEl = null;

  function openDeckSettingsModal(triggerEl = document.activeElement) {
    const deck = getDeck();
    if (!deck || !deckSettingsModal.modalEl) return;

    deckSettingsTriggerEl = triggerEl instanceof HTMLElement ? triggerEl : null;
    deckSettingsModal.titleEl.value = deck.title || '';
    deckSettingsModal.folderEl.value = deck.id || '';
    deckSettingsModal.descEl.value = deck.description || '';
    deckSettingsModal.cwdEl.value = normalizeRelativeDirectory(deck.terminal?.cwd || '');
    deckSettingsModal.titleEl.classList.remove('modal-input-error');
    deckSettingsModal.folderEl.classList.remove('modal-input-error');
    deckSettingsModal.modalEl.hidden = false;
    deckSettingsModal.titleEl.focus();
  }

  function closeDeckSettingsModal({ restore = true } = {}) {
    if (!deckSettingsModal.modalEl) return;
    deckSettingsModal.modalEl.hidden = true;
    deckSettingsModal.formEl?.reset();
    if (restore) {
      restoreFocus(deckSettingsTriggerEl);
    }
    deckSettingsTriggerEl = null;
  }

  function applyDeckSettingsFromModal() {
    const deck = getDeck();
    if (!deck) return false;

    const nextTitle = deckSettingsModal.titleEl.value.trim();
    if (!nextTitle) {
      deckSettingsModal.titleEl.classList.add('modal-input-error');
      deckSettingsModal.titleEl.focus();
      return false;
    }
    deckSettingsModal.titleEl.classList.remove('modal-input-error');

    const nextFolderName = normalizeDeckFolderName(deckSettingsModal.folderEl.value);
    if (!DECK_FOLDER_PATTERN.test(nextFolderName)) {
      deckSettingsModal.folderEl.classList.add('modal-input-error');
      deckSettingsModal.folderEl.focus();
      return false;
    }
    deckSettingsModal.folderEl.classList.remove('modal-input-error');

    const nextDescription = deckSettingsModal.descEl.value.trim();
    const nextCwd = normalizeRelativeDirectory(deckSettingsModal.cwdEl.value);
    const currentCwd = normalizeRelativeDirectory(deck.terminal?.cwd || '');
    const changed =
      deck.title !== nextTitle ||
      deck.description !== nextDescription ||
      deck.id !== nextFolderName ||
      currentCwd !== nextCwd;

    deck.title = nextTitle;
    deck.description = nextDescription;
    deck.id = nextFolderName;
    deck.terminal = { cwd: nextCwd };
    setEditorDeckName(deck.title);

    if (changed) markDirty();
    return true;
  }

  function renderCwdPickerList(directories) {
    if (!cwdPicker.listEl) return;

    if (!directories.length) {
      cwdPicker.listEl.innerHTML = '<p class="cwd-picker-empty">サブディレクトリがありません</p>';
      return;
    }

    cwdPicker.listEl.innerHTML = directories
      .map((directory) => {
        const dirPath = normalizeRelativeDirectory(directory.path || '');
        return `
        <button type="button" class="cwd-picker-item" data-path="${escapeHtml(dirPath)}">
          <span class="cwd-picker-item-name">${escapeHtml(directory.name || '')}</span>
          <span class="cwd-picker-item-path">${escapeHtml(formatRelativeDirectoryDisplay(dirPath))}</span>
        </button>
      `;
      })
      .join('');

    cwdPicker.listEl.querySelectorAll('.cwd-picker-item').forEach((button) => {
      button.addEventListener('click', async () => {
        await loadCwdPickerDirectory(button.dataset.path || '');
      });
    });
  }

  async function loadCwdPickerDirectory(requestedPath) {
    const pathToLoad = normalizeRelativeDirectory(requestedPath || '');
    try {
      const payload = await api.listDirectories(pathToLoad);
      cwdPicker.currentPath = normalizeRelativeDirectory(payload.currentPath || '');
      cwdPicker.parentPath =
        typeof payload.parentPath === 'string'
          ? normalizeRelativeDirectory(payload.parentPath)
          : null;

      if (cwdPicker.currentEl) {
        cwdPicker.currentEl.textContent = formatRelativeDirectoryDisplay(cwdPicker.currentPath);
      }
      if (cwdPicker.upBtn) {
        cwdPicker.upBtn.disabled = !cwdPicker.parentPath;
      }

      const directories = Array.isArray(payload.directories) ? payload.directories : [];
      renderCwdPickerList(directories);
    } catch {
      showToast('ディレクトリ一覧の取得に失敗しました');
    }
  }

  function openCwdPickerModal(targetInputEl = deckSettingsModal.cwdEl) {
    if (!cwdPicker.modalEl) return;
    cwdPickerTriggerEl =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cwdPicker.targetInputEl = targetInputEl || deckSettingsModal.cwdEl;
    cwdPicker.modalEl.hidden = false;
    const initialPath = normalizeRelativeDirectory(cwdPicker.targetInputEl?.value || '');
    loadCwdPickerDirectory(initialPath);
  }

  function closeCwdPickerModal({ restore = true } = {}) {
    if (!cwdPicker.modalEl) return;
    cwdPicker.modalEl.hidden = true;
    cwdPicker.targetInputEl = null;
    if (restore) {
      restoreFocus(cwdPickerTriggerEl);
    }
    cwdPickerTriggerEl = null;
  }

  function applyCwdPickerSelection() {
    const input = cwdPicker.targetInputEl || deckSettingsModal.cwdEl;
    if (!input) {
      closeCwdPickerModal();
      return;
    }

    const nextValue = normalizeRelativeDirectory(cwdPicker.currentPath || '');
    if (input.value !== nextValue) {
      input.value = nextValue;
    }
    closeCwdPickerModal({ restore: false });
    input.focus();
  }

  function setupDeckSettingsModalEventListeners() {
    if (!deckSettingsModal.modalEl || !deckSettingsModal.openBtn || !deckSettingsModal.formEl)
      return;

    deckSettingsModal.openBtn.addEventListener('click', (event) => {
      openDeckSettingsModal(event.currentTarget);
    });
    deckSettingsModal.cancelBtn?.addEventListener('click', closeDeckSettingsModal);
    deckSettingsModal.pickCwdBtn?.addEventListener('click', () => {
      openCwdPickerModal(deckSettingsModal.cwdEl);
    });

    deckSettingsModal.titleEl?.addEventListener('input', () => {
      deckSettingsModal.titleEl.classList.remove('modal-input-error');
    });

    deckSettingsModal.folderEl?.addEventListener('input', () => {
      deckSettingsModal.folderEl.classList.remove('modal-input-error');
    });

    deckSettingsModal.modalEl.addEventListener('click', (event) => {
      if (event.target === deckSettingsModal.modalEl) {
        closeDeckSettingsModal();
      }
    });

    deckSettingsModal.formEl.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!applyDeckSettingsFromModal()) return;
      closeDeckSettingsModal();
      showToast('デッキ設定を反映しました');
    });
  }

  function setupCwdPickerEventListeners() {
    if (!cwdPicker.modalEl) return;

    cwdPicker.cancelBtn?.addEventListener('click', closeCwdPickerModal);
    cwdPicker.selectBtn?.addEventListener('click', applyCwdPickerSelection);
    cwdPicker.homeBtn?.addEventListener('click', async () => {
      await loadCwdPickerDirectory('');
    });
    cwdPicker.upBtn?.addEventListener('click', async () => {
      if (!cwdPicker.parentPath) return;
      await loadCwdPickerDirectory(cwdPicker.parentPath);
    });

    cwdPicker.modalEl.addEventListener('click', (event) => {
      if (event.target === cwdPicker.modalEl) {
        closeCwdPickerModal();
      }
    });
  }

  function setupModalKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
      if (cwdPicker.modalEl && !cwdPicker.modalEl.hidden) {
        if (event.key === 'Escape') {
          closeCwdPickerModal();
          return;
        }
        trapFocusInModal(event, cwdPicker.modalEl);
        return;
      }

      if (deckSettingsModal.modalEl && !deckSettingsModal.modalEl.hidden) {
        if (event.key === 'Escape') {
          closeDeckSettingsModal();
          return;
        }
        trapFocusInModal(event, deckSettingsModal.modalEl);
      }
    });
  }

  setupDeckSettingsModalEventListeners();
  setupCwdPickerEventListeners();
  setupModalKeyboardShortcuts();

  return {
    openDeckSettingsModal,
  };
}
