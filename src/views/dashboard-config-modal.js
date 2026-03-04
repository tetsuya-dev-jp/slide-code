import * as api from '../core/api.js';
import { showToast } from '../utils/helpers.js';

function toDisplayPath(pathValue, homePath) {
  const normalizedPath = typeof pathValue === 'string' ? pathValue.replace(/\\/g, '/') : '';
  const normalizedHome = typeof homePath === 'string' ? homePath.replace(/\\/g, '/') : '';
  if (!normalizedPath) return '';
  if (!normalizedHome) return normalizedPath;
  if (normalizedPath === normalizedHome) return '~';
  if (normalizedPath.startsWith(`${normalizedHome}/`)) {
    return `~/${normalizedPath.slice(normalizedHome.length + 1)}`;
  }
  return normalizedPath;
}

export function initDashboardConfigModal({ onSaved } = {}) {
  const openBtn = document.getElementById('dashboardConfigBtn');
  const modalEl = document.getElementById('appConfigModal');
  const formEl = document.getElementById('appConfigForm');
  const decksDirEl = document.getElementById('appConfigDecksDir');
  const baseCwdEl = document.getElementById('appConfigTerminalBaseCwd');
  const shellEl = document.getElementById('appConfigTerminalShell');
  const pathEl = document.getElementById('appConfigFilePath');
  const cancelBtn = document.getElementById('appConfigCancel');
  const pickDecksDirBtn = document.getElementById('pickAppConfigDecksDirBtn');
  const pickBaseCwdBtn = document.getElementById('pickAppConfigTerminalBaseCwdBtn');

  const picker = {
    modalEl: document.getElementById('configDirPickerModal'),
    currentEl: document.getElementById('configDirPickerCurrent'),
    listEl: document.getElementById('configDirPickerList'),
    homeBtn: document.getElementById('configDirPickerHomeBtn'),
    upBtn: document.getElementById('configDirPickerUpBtn'),
    cancelBtn: document.getElementById('configDirPickerCancel'),
    selectBtn: document.getElementById('configDirPickerSelect'),
    currentPath: '',
    parentPath: null,
    homePath: '',
    targetInput: null,
  };

  if (!openBtn || !modalEl || !formEl || !decksDirEl || !baseCwdEl || !shellEl || !pathEl || !cancelBtn) {
    return;
  }

  function closeModal() {
    modalEl.hidden = true;
    decksDirEl.classList.remove('modal-input-error');
    baseCwdEl.classList.remove('modal-input-error');
  }

  function closePickerModal() {
    if (!picker.modalEl) return;
    picker.modalEl.hidden = true;
    picker.targetInput = null;
  }

  function renderPickerList(directories) {
    if (!picker.listEl) return;
    picker.listEl.innerHTML = '';

    if (!directories.length) {
      const emptyEl = document.createElement('p');
      emptyEl.className = 'cwd-picker-empty';
      emptyEl.textContent = 'サブディレクトリがありません';
      picker.listEl.appendChild(emptyEl);
      return;
    }

    directories.forEach((directory) => {
      const itemBtn = document.createElement('button');
      itemBtn.type = 'button';
      itemBtn.className = 'cwd-picker-item';
      itemBtn.dataset.path = typeof directory.path === 'string' ? directory.path : '';

      const nameEl = document.createElement('span');
      nameEl.className = 'cwd-picker-item-name';
      nameEl.textContent = directory.name || '';

      const pathTextEl = document.createElement('span');
      pathTextEl.className = 'cwd-picker-item-path';
      pathTextEl.textContent = toDisplayPath(directory.path || '', picker.homePath || '');

      itemBtn.append(nameEl, pathTextEl);
      itemBtn.addEventListener('click', async () => {
        await loadPickerDirectory(itemBtn.dataset.path || '');
      });
      picker.listEl.appendChild(itemBtn);
    });
  }

  async function loadPickerDirectory(requestedPath) {
    try {
      const payload = await api.listSystemDirectories(requestedPath || '');
      picker.currentPath = payload.currentPath || '';
      picker.parentPath = payload.parentPath || null;
      picker.homePath = payload.homePath || picker.homePath || '';

      if (picker.currentEl) {
        picker.currentEl.textContent = toDisplayPath(picker.currentPath, picker.homePath);
      }
      if (picker.upBtn) {
        picker.upBtn.disabled = !picker.parentPath;
      }

      const directories = Array.isArray(payload.directories) ? payload.directories : [];
      renderPickerList(directories);
    } catch {
      showToast('ディレクトリ一覧の取得に失敗しました');
    }
  }

  async function openPickerModal(targetInput) {
    if (!picker.modalEl) return;
    picker.targetInput = targetInput;
    picker.modalEl.hidden = false;
    const initialPath = targetInput?.value?.trim() || '';
    await loadPickerDirectory(initialPath);
  }

  function applyPickerSelection() {
    if (!picker.targetInput) {
      closePickerModal();
      return;
    }

    picker.targetInput.value = picker.currentPath || '';
    picker.targetInput.classList.remove('modal-input-error');
    closePickerModal();
  }

  async function openModal() {
    try {
      const config = await api.getAppConfig();
      decksDirEl.value = config.decksDir || '';
      baseCwdEl.value = config.terminalBaseCwd || '';
      shellEl.value = config.terminalShell || '';
      pathEl.textContent = config.configFilePath || '';
      decksDirEl.classList.remove('modal-input-error');
      baseCwdEl.classList.remove('modal-input-error');
      modalEl.hidden = false;
      decksDirEl.focus();
    } catch (err) {
      if (err?.status === 404) {
        showToast('設定APIが見つかりません。バックエンドを再起動してください');
        return;
      }
      showToast('設定の読み込みに失敗しました');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const decksDir = decksDirEl.value.trim();
    const terminalBaseCwd = baseCwdEl.value.trim();
    const terminalShell = shellEl.value.trim();

    const invalidDecksDir = !decksDir;
    const invalidBaseCwd = !terminalBaseCwd;
    decksDirEl.classList.toggle('modal-input-error', invalidDecksDir);
    baseCwdEl.classList.toggle('modal-input-error', invalidBaseCwd);
    if (invalidDecksDir || invalidBaseCwd) {
      (invalidDecksDir ? decksDirEl : baseCwdEl).focus();
      return;
    }

    try {
      const config = await api.updateAppConfig({
        decksDir,
        terminalBaseCwd,
        terminalShell,
      });

      pathEl.textContent = config.configFilePath || pathEl.textContent;
      closeModal();
      showToast('設定を保存しました');
      if (typeof onSaved === 'function') {
        await onSaved();
      }
    } catch (err) {
      if (err?.status === 404) {
        showToast('設定APIが見つかりません。バックエンドを再起動してください');
        return;
      }
      if (err?.status === 400) {
        showToast('設定値が不正です');
        return;
      }
      showToast('設定の保存に失敗しました');
    }
  }

  openBtn.addEventListener('click', openModal);
  cancelBtn.addEventListener('click', closeModal);
  modalEl.addEventListener('click', (event) => {
    if (event.target === modalEl) closeModal();
  });
  formEl.addEventListener('submit', handleSubmit);

  pickDecksDirBtn?.addEventListener('click', async () => {
    await openPickerModal(decksDirEl);
  });

  pickBaseCwdBtn?.addEventListener('click', async () => {
    await openPickerModal(baseCwdEl);
  });

  picker.cancelBtn?.addEventListener('click', closePickerModal);
  picker.selectBtn?.addEventListener('click', applyPickerSelection);
  picker.homeBtn?.addEventListener('click', async () => {
    await loadPickerDirectory(picker.homePath || '');
  });
  picker.upBtn?.addEventListener('click', async () => {
    if (!picker.parentPath) return;
    await loadPickerDirectory(picker.parentPath);
  });
  picker.modalEl?.addEventListener('click', (event) => {
    if (event.target === picker.modalEl) closePickerModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (picker.modalEl && !picker.modalEl.hidden) {
      closePickerModal();
      return;
    }
    if (!modalEl.hidden) {
      closeModal();
    }
  });
}
