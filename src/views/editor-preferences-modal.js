import {
  getDefaultEditorPreferences,
  getEditorPreferences,
  setEditorPreferences,
} from '../core/preferences.js';
import { restoreFocus, trapFocusInModal } from '../utils/focus-trap.js';

export function initEditorPreferencesModal({ applyPreferences, showToast }) {
  const modalEl = document.getElementById('editorPreferencesModal');
  const formEl = document.getElementById('editorPreferencesForm');
  const cancelBtn = document.getElementById('editorPreferencesCancel');
  const autosaveCheckbox = document.getElementById('editorPrefAutosave');
  const autosaveDelaySelect = document.getElementById('editorPrefAutosaveDelay');

  if (!modalEl || !formEl || !cancelBtn || !autosaveCheckbox || !autosaveDelaySelect) {
    return {
      open: () => {},
      getPreferences: getDefaultEditorPreferences,
    };
  }

  let triggerEl = null;

  function fillForm(preferences) {
    document.getElementById('editorPrefFontSize').value = String(preferences.fontSize);
    document.getElementById('editorPrefTabSize').value = String(preferences.tabSize);
    document.getElementById('editorPrefWordWrap').value = preferences.wordWrap;
    document.getElementById('editorPrefLineNumbers').value = preferences.lineNumbers;
    document.getElementById('editorPrefMinimap').checked = preferences.minimap;
    autosaveCheckbox.checked = preferences.autosave;
    autosaveDelaySelect.value = String(preferences.autosaveDelay);
    autosaveDelaySelect.disabled = !preferences.autosave;
  }

  function readForm() {
    return {
      fontSize: parseInt(document.getElementById('editorPrefFontSize').value, 10),
      tabSize: parseInt(document.getElementById('editorPrefTabSize').value, 10),
      wordWrap: document.getElementById('editorPrefWordWrap').value,
      lineNumbers: document.getElementById('editorPrefLineNumbers').value,
      minimap: document.getElementById('editorPrefMinimap').checked,
      autosave: autosaveCheckbox.checked,
      autosaveDelay: parseInt(autosaveDelaySelect.value, 10),
    };
  }

  function close({ restore = true } = {}) {
    modalEl.hidden = true;
    if (restore) {
      restoreFocus(triggerEl);
    }
    triggerEl = null;
  }

  function open(nextTriggerEl = document.activeElement) {
    triggerEl = nextTriggerEl instanceof HTMLElement ? nextTriggerEl : null;
    fillForm(getEditorPreferences());
    modalEl.hidden = false;
    document.getElementById('editorPrefFontSize').focus();
  }

  autosaveCheckbox.addEventListener('change', () => {
    autosaveDelaySelect.disabled = !autosaveCheckbox.checked;
  });

  cancelBtn.addEventListener('click', () => close());
  modalEl.addEventListener('click', (event) => {
    if (event.target === modalEl) close();
  });

  document.addEventListener('keydown', (event) => {
    if (modalEl.hidden) return;
    if (event.key === 'Escape') {
      close();
      return;
    }
    trapFocusInModal(event, modalEl);
  });

  formEl.addEventListener('submit', (event) => {
    event.preventDefault();
    const nextPreferences = readForm();
    setEditorPreferences(nextPreferences);
    applyPreferences?.(getEditorPreferences());
    showToast?.('エディタ設定を保存しました');
    close({ restore: false });
  });

  return {
    open,
    getPreferences: getEditorPreferences,
  };
}
