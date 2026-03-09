/**
 * Editor View
 * Deck editor with Monaco Editor, file management, and slide editing
 */

import * as api from '../core/api.js';
import * as monaco from 'monaco-editor';
import {
  compactLineGroups as groupConsecutiveLines,
  createDefaultFile,
  createDefaultSlide,
  ensureDeckShape,
  normalizeDraftSlideState as normalizeSlideDraftState,
  normalizeLineRange as clampLineRange,
  normalizeRelativeDirectory as normalizeDeckRelativeDirectory,
  parseHighlightLinesInput as parseHighlightInputText,
  resolveDeckFile,
  resolveUniqueFilePath,
  syncSlideFileReference,
} from '../core/deck-utils.js';
import { MarkdownPane } from '../panes/markdown.js';
import {
  getLastEditorState,
  getEditorPreferences,
  recordRecentDeck,
  setLastEditorState,
} from '../core/preferences.js';
import { initEditorDeckSettings } from './editor-deck-settings.js';
import { setupEditorLayoutControls } from './editor-layout-controls.js';
import { initEditorAssetsModal } from './editor-assets-modal.js';
import { isFileAlreadyLoaded } from './editor-file-selection.js';
import { getEditorFileValidationState } from './editor-file-validation.js';
import { createMarkdownEditor } from './editor-markdown-editor.js';
import { initEditorPreferencesModal } from './editor-preferences-modal.js';
import { reconcileDeckAfterSave } from './editor-save-state.js';
import { restoreFocus, trapFocusInModal } from '../utils/focus-trap.js';
import { showToast, escapeHtml, debounce } from '../utils/helpers.js';
import { getLangIcon } from '../utils/lang-icons.js';
import { detectLanguage, monacoLangId } from '../utils/lang-detect.js';

// Configure Monaco workers for Vite
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') {
      return new Worker(new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url), { type: 'module' });
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new Worker(new URL('monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url), { type: 'module' });
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new Worker(new URL('monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url), { type: 'module' });
    }
    if (label === 'typescript' || label === 'javascript') {
      return new Worker(new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url), { type: 'module' });
    }
    return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' });
  },
};

export function initEditor(router) {
  const MONACO_THEME = {
    dark: 'slidecode-dark',
    light: 'vs',
  };
  const EMPTY_FILE_ID_VALUE = '';
  const EMPTY_FILE_ID_LABEL = '参照なし';

  function ensureMonacoThemes() {
    monaco.editor.defineTheme(MONACO_THEME.dark, {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0b0b0b',
        'editor.foreground': '#f2f2f2',
        'editorLineNumber.foreground': '#8f8f8f',
        'editorLineNumber.activeForeground': '#f2f2f2',
        'editorGutter.background': '#0b0b0b',
        'editor.lineHighlightBackground': '#171717',
        'editor.lineHighlightBorder': '#2b2b2b',
        'editor.selectionBackground': '#b7ff1a40',
        'editor.inactiveSelectionBackground': '#b7ff1a28',
        'editorCursor.foreground': '#d0ff6a',
        'editorIndentGuide.background1': '#242424',
        'editorIndentGuide.activeBackground1': '#b7ff1a',
        'editorWhitespace.foreground': '#8f8f8f44',
        'scrollbarSlider.background': '#b7ff1a38',
        'scrollbarSlider.hoverBackground': '#b7ff1a50',
        'scrollbarSlider.activeBackground': '#b7ff1a70',
      },
    });
  }

  let deck = null;
  let persistedDeckId = null;
  let slideIndex = 0;
  let fileIndex = 0;
  let monacoEditor = null;
  let monacoDecorations = [];
  let dirty = false;
  let loading = false;
  let changeVersion = 0;
  let autosaveTimer = null;
  let saveQueue = Promise.resolve();
  let showRequestId = 0;
  let editorPreferences = getEditorPreferences();
  const saveButtonEl = document.getElementById('editorSaveBtn');
  const saveStatusEl = document.getElementById('editorSaveStatus');

  const mdPreviewPane = new MarkdownPane(document.getElementById('editorMarkdownPreview'), {
    resolveAssetUrl: (assetPath) => {
      const deckId = persistedDeckId || deck?.id;
      if (!deckId) return `asset://${assetPath}`;
      return api.getDeckAssetUrl(deckId, assetPath);
    },
    resetScrollOnRender: false,
  });
  let deckSettingsController = null;
  let assetsModal = null;
  let editorPreferencesModal = null;
  let markdownEditor = null;
  let fileValidationState = { message: '', normalizedName: '' };

  // --- Dirty state ---

  function setSaveStatus(state) {
    if (!saveStatusEl) return;

    saveStatusEl.dataset.state = state;
    if (state === 'pending') {
      saveStatusEl.textContent = '未保存の変更';
      return;
    }
    if (state === 'saving') {
      saveStatusEl.textContent = '保存中...';
      return;
    }
    if (state === 'error') {
      saveStatusEl.textContent = '保存エラー';
      return;
    }
    saveStatusEl.textContent = '保存済み';
  }

  function clearAutosaveTimer() {
    if (!autosaveTimer) return;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  function applyEditorPreferences(preferences) {
    editorPreferences = preferences;
    if (!monacoEditor) return;

    monacoEditor.updateOptions({
      fontSize: preferences.fontSize,
      tabSize: preferences.tabSize,
      wordWrap: preferences.wordWrap,
      lineNumbers: preferences.lineNumbers,
      minimap: { enabled: preferences.minimap },
    });
  }

  function scheduleAutosave() {
    if (!deck || loading) return;
    if (!editorPreferences.autosave) return;
    clearAutosaveTimer();
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = null;
      requestPersistDeck({
        source: 'auto',
        fallbackMessage: '自動保存に失敗しました',
        notifyOnSuccess: false,
        surfaceErrors: false,
      }).catch(() => {
        // Keep editor state and let status indicator communicate the failure.
      });
    }, editorPreferences.autosaveDelay);
  }

  function enqueueSaveTask(task) {
    const queued = saveQueue.then(() => task(), () => task());
    saveQueue = queued.catch(() => {});
    return queued;
  }

  function markDirty() {
    if (loading) return;
    changeVersion += 1;
    if (!dirty) {
      dirty = true;
      saveButtonEl?.classList.add('has-changes');
    }
    setSaveStatus('pending');
    scheduleAutosave();
  }

  function clearDirty(savedVersion = null) {
    if (savedVersion !== null && savedVersion !== changeVersion) {
      return false;
    }
    dirty = false;
    saveButtonEl?.classList.remove('has-changes');
    return true;
  }

  function hasUnsavedChanges() {
    return dirty;
  }

  function persistEditorViewState() {
    const deckId = persistedDeckId || deck?.id;
    if (!deckId) return;

    setLastEditorState({
      deckId,
      slideIndex,
      fileId: deck?.files?.[fileIndex]?.id || '',
    });
  }

  function setFileNameError(message = '') {
    fileValidationState.message = message;
    const input = document.getElementById('editorFileName');
    const errorEl = document.getElementById('editorFileNameError');
    input?.classList.toggle('input-error', Boolean(message));
    input?.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (errorEl) {
      errorEl.hidden = !message;
      errorEl.textContent = message;
    }
  }

  function validateCurrentFileName() {
    const file = deck?.files?.[fileIndex];
    const rawName = document.getElementById('editorFileName')?.value || '';
    fileValidationState = getEditorFileValidationState({
      currentFile: file || null,
      rawName,
      files: deck?.files || [],
    });
    setFileNameError(fileValidationState.message);
    return !fileValidationState.message;
  }

  function syncEditorAfterDeckNormalization(preferredFileId = '', preferredSlideIndex = slideIndex) {
    ensureDeckShape(deck);
    const nextSlideIndex = Math.min(Math.max(preferredSlideIndex, 0), Math.max(deck.slides.length - 1, 0));
    const nextFileId = preferredFileId || deck.files[0]?.id || '';
    renderFileTabs();
    renderSlideList();
    loadSlide(nextSlideIndex);
    if (nextFileId) {
      loadFileById(nextFileId);
    }
    updateFileRefOptions();
    assetsModal?.refreshBrokenReferences();
  }

  function confirmLeave({ from, to } = {}) {
    if (!dirty || from === to) {
      return true;
    }

    const shouldLeave = window.confirm('保存していない変更があります。移動すると失われる可能性があります。続けますか？');
    if (!shouldLeave) {
      return false;
    }

    clearAutosaveTimer();
    clearDirty();
    changeVersion = 0;
    setSaveStatus('saved');
    return true;
  }

  function requestPersistDeck({
    source = 'manual',
    fallbackMessage = '保存に失敗しました',
    notifyOnSuccess = false,
    surfaceErrors = true,
  } = {}) {
    clearAutosaveTimer();

    return enqueueSaveTask(async () => {
      if (!deck) return { saved: false, skipped: true };

      if (!dirty) {
        if (source !== 'auto') {
          setSaveStatus('saved');
        }
        if (notifyOnSuccess) {
          showToast('保存済みです');
        }
        return { saved: false, skipped: true };
      }

      const saveVersion = changeVersion;
      setSaveStatus('saving');

      try {
        await persistDeckToServer(saveVersion);
        const unchangedSinceSaveStarted = clearDirty(saveVersion);
        renderSlideList();

        if (unchangedSinceSaveStarted) {
          setSaveStatus('saved');
          if (notifyOnSuccess) {
            showToast('保存しました');
          }
          return { saved: true, skipped: false };
        }

        setSaveStatus('pending');
        scheduleAutosave();
        if (notifyOnSuccess) {
          showToast('保存中に変更があったため、再保存します');
        }
        return { saved: false, skipped: false };
      } catch (err) {
        setSaveStatus('error');
        if (surfaceErrors) {
          handlePersistDeckError(err, fallbackMessage);
        }
        throw err;
      }
    });
  }

  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // --- File Tabs ---

  function getFileById(fileId) {
    if (!deck || typeof fileId !== 'string' || !fileId.trim()) return null;
    return deck.files.find(file => file.id === fileId) || null;
  }

  function getResolvedSlideFile(slide) {
    if (!deck || !slide) return null;
    return resolveDeckFile(deck.files, slide);
  }

  function hasSelectedFileId(fileId) {
    return typeof fileId === 'string' && fileId.trim().length > 0;
  }

  function clearLoadedFile() {
    loading = true;
    fileIndex = -1;
    document.getElementById('editorFileName').value = '';
    document.getElementById('editorFileLang').value = '';

    if (monacoEditor) {
      monacoEditor.updateOptions({ readOnly: true });
      monacoEditor.setValue('');
      monaco.editor.setModelLanguage(monacoEditor.getModel(), monacoLangId('plaintext'));
      updateMonacoDecorations();
    }

    document.querySelectorAll('.editor-file-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    setFileNameError('');
    loading = false;
    persistEditorViewState();
  }

  function renderFileTabs() {
    const tabs = document.getElementById('editorFileTabs');
    tabs.innerHTML = deck.files.map((file, i) => `
      <button class="editor-file-tab ${i === fileIndex ? 'active' : ''}" data-index="${i}">
        ${escapeHtml(file.name || '無名')}
      </button>
    `).join('');

    tabs.querySelectorAll('.editor-file-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        saveCurrentFile();
        loadFile(parseInt(tab.dataset.index));
      });
    });

    updateFileRefOptions();
  }

  function updateFileRefOptions() {
    const select = document.getElementById('editorFileRef');
    const currentVal = select.value;
    select.innerHTML = [
      `<option value="${EMPTY_FILE_ID_VALUE}">${EMPTY_FILE_ID_LABEL}</option>`,
      ...deck.files.map(f =>
        `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`,
      ),
    ].join('');
    if (currentVal === EMPTY_FILE_ID_VALUE || deck.files.some(f => f.id === currentVal)) {
      select.value = currentVal;
    } else {
      select.value = EMPTY_FILE_ID_VALUE;
    }
  }

  function resetSelectionInputsForNoReference() {
    setLineRangeInputs(1, 1);
    setHighlightInput([]);
  }

  function getSlideMetaText(slide) {
    const lineRange = slide.lineRange || [1, 1];
    const file = getResolvedSlideFile(slide);

    if (!file) {
      return '参照なし';
    }

    return `${escapeHtml(file.name)} L${lineRange[0]}–${lineRange[1]}`;
  }

  function getDraftSlideStateFromForm() {
    const fileId = document.getElementById('editorFileRef').value;
    if (!hasSelectedFileId(fileId)) {
      return {
        fileId: EMPTY_FILE_ID_VALUE,
        fileRef: '',
        lineRange: [1, 1],
        highlightLines: [],
      };
    }

    const file = getFileById(fileId);

    const lineStart = parseInt(document.getElementById('editorLineStart').value, 10);
    const lineEnd = parseInt(document.getElementById('editorLineEnd').value, 10);

    return {
      fileId,
      fileRef: file?.name || '',
      lineRange: [
        Number.isFinite(lineStart) ? lineStart : 1,
        Number.isFinite(lineEnd) ? lineEnd : (Number.isFinite(lineStart) ? lineStart : 1),
      ],
      highlightLines: parseHighlightInputText(document.getElementById('editorHighlight').value),
    };
  }

  function setLineRangeInputs(startLine, endLine) {
    document.getElementById('editorLineStart').value = startLine;
    document.getElementById('editorLineEnd').value = endLine;
  }

  function setHighlightInput(lines) {
    const normalized = Array.from(
      new Set((lines || []).map(line => parseInt(line, 10)).filter(line => Number.isFinite(line) && line >= 1)),
    ).sort((a, b) => a - b);
    document.getElementById('editorHighlight').value = normalized.join(', ');
  }

  function getNormalizedDraftSlideState(draft) {
    if (!deck) return null;
    return normalizeSlideDraftState(draft, deck.files);
  }

  function renderRangeSummary(slideState = null) {
    const summaryEl = document.getElementById('editorRangeSummary');
    if (!summaryEl) return;

    const draft = slideState || getDraftSlideStateFromForm();
    if (!hasSelectedFileId(draft?.fileId)) {
      summaryEl.textContent = '参照なし';
      return;
    }

    const result = getNormalizedDraftSlideState(draft);
    if (!result) {
      summaryEl.textContent = '範囲未設定';
      return;
    }

    const [start, end] = result.normalized.lineRange;
    const count = Math.max(end - start + 1, 1);
    summaryEl.textContent = start === end
      ? `L${start} (1行)`
      : `L${start}-L${end} (${count}行)`;
  }

  function renderHighlightChips(slideState = null) {
    const chipsEl = document.getElementById('editorHighlightChips');
    if (!chipsEl) return;

    const draft = slideState || getDraftSlideStateFromForm();
    if (!hasSelectedFileId(draft?.fileId)) {
      chipsEl.innerHTML = '<span class="editor-chip-placeholder">参照なし</span>';
      return;
    }

    const lines = [...(draft.highlightLines || [])].sort((a, b) => a - b);
    const groups = groupConsecutiveLines(lines);

    if (!groups.length) {
      chipsEl.innerHTML = '<span class="editor-chip-placeholder">未選択</span>';
      return;
    }

    chipsEl.innerHTML = groups.map(group => {
      const label = group.start === group.end
        ? `L${group.start}`
        : `L${group.start}-L${group.end}`;
      return `
        <span class="editor-highlight-chip">
          <span>${label}</span>
          <button class="editor-highlight-chip-remove" data-remove-range="${group.start}:${group.end}" title="この範囲を解除" aria-label="ハイライト範囲 ${label} を解除">x</button>
        </span>
      `;
    }).join('');
  }

  function refreshSelectionWidgets(slideState = null) {
    renderRangeSummary(slideState);
    renderHighlightChips(slideState);
  }

  function setHighlightInputVisible(visible) {
    const rowEl = document.getElementById('editorHighlightInputRow');
    const toggleBtn = document.getElementById('toggleHighlightInputBtn');
    if (!rowEl || !toggleBtn) return;

    rowEl.hidden = !visible;
    toggleBtn.textContent = visible ? '編集を閉じる' : '編集';
  }

  function resetRangeToWholeFile() {
    if (!deck) return;

    const fileId = document.getElementById('editorFileRef').value;
    const targetFile = getFileById(fileId);
    if (!targetFile) return;

    const lineCount = (targetFile.code || '').split('\n').length;
    const [, endLine] = clampLineRange([1, lineCount], lineCount);
    setLineRangeInputs(1, endLine);
    updateCodePreview({ saveFile: false, reveal: false });
    markDirty();
  }

  function syncMonacoWithFormState({ saveFile = false, reveal = false } = {}) {
    if (!deck) return;

    if (saveFile) saveCurrentFile();

    const draft = getDraftSlideStateFromForm();
    const result = getNormalizedDraftSlideState(draft);
    if (!result) {
      updateMonacoDecorations(draft);
      refreshSelectionWidgets(draft);
      return;
    }

    const { targetFile, normalized } = result;
    const lineStartInput = document.getElementById('editorLineStart');
    const lineEndInput = document.getElementById('editorLineEnd');
    if (parseInt(lineStartInput.value, 10) !== normalized.lineRange[0]) {
      lineStartInput.value = normalized.lineRange[0];
    }
    if (parseInt(lineEndInput.value, 10) !== normalized.lineRange[1]) {
      lineEndInput.value = normalized.lineRange[1];
    }

    const highlightInput = document.getElementById('editorHighlight');
    const nextHighlightValue = normalized.highlightLines.join(', ');
    if (highlightInput.value !== nextHighlightValue) {
      highlightInput.value = nextHighlightValue;
    }

    refreshSelectionWidgets(normalized);

    updateMonacoDecorations(normalized);

    const currentFile = deck.files[fileIndex];
    if (reveal && monacoEditor && currentFile && currentFile.id === targetFile.id) {
      monacoEditor.revealLineInCenter(normalized.lineRange[0]);
    }
  }

  function loadFileById(fileId) {
    if (!hasSelectedFileId(fileId)) {
      saveCurrentFile();
      clearLoadedFile();
      return;
    }

    const nextIndex = deck.files.findIndex(file => file.id === fileId);
    if (nextIndex < 0) {
      saveCurrentFile();
      clearLoadedFile();
      return;
    }

    if (nextIndex === fileIndex) {
      const currentFile = deck.files[fileIndex];
      const editorValue = monacoEditor ? monacoEditor.getValue() : null;
      if (isFileAlreadyLoaded({
        currentFile,
        requestedFileId: fileId,
        editorValue,
      })) {
        return;
      }

      loadFile(nextIndex);
      return;
    }

    saveCurrentFile();
    loadFile(nextIndex);
  }

  function updateMonacoDecorations(slideState = null) {
    if (!monacoEditor || !deck) return;

    const slide = slideState || deck.slides[slideIndex];
    const file = deck.files[fileIndex];
    const targetFile = slide ? getResolvedSlideFile(slide) : null;
    if (!slide || !file || !targetFile || targetFile.id !== file.id) {
      monacoDecorations = monacoEditor.deltaDecorations(monacoDecorations, []);
      return;
    }

    const [start, end] = clampLineRange(slide.lineRange || [1, 1], (file.code || '').split('\n').length);
    const highlightLines = (slide.highlightLines || [])
      .map(line => parseInt(line, 10))
      .filter(line => Number.isFinite(line) && line >= 1);

    const rangeDecorations = [{
      range: new monaco.Range(start, 1, end, 1),
      options: {
        isWholeLine: true,
        className: 'monaco-range-line',
        linesDecorationsClassName: 'monaco-range-lines-decoration',
      },
    }];

    if (end === start) {
      rangeDecorations.push({
        range: new monaco.Range(start, 1, start, 1),
        options: {
          isWholeLine: true,
          className: 'monaco-range-single-line',
        },
      });
    } else {
      rangeDecorations.push({
        range: new monaco.Range(start, 1, start, 1),
        options: {
          isWholeLine: true,
          className: 'monaco-range-start-line',
        },
      }, {
        range: new monaco.Range(end, 1, end, 1),
        options: {
          isWholeLine: true,
          className: 'monaco-range-end-line',
        },
      });
    }

    const highlightDecorations = highlightLines.map(line => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: 'monaco-hl-line',
        glyphMarginClassName: 'monaco-hl-glyph',
        linesDecorationsClassName: 'monaco-hl-lines-decoration',
      },
    }));

    const newDecorations = [...rangeDecorations, ...highlightDecorations];

    monacoDecorations = monacoEditor.deltaDecorations(monacoDecorations, newDecorations);
  }
  function loadFile(index) {
    loading = true;
    fileIndex = index;
    const file = deck.files[index];
    if (!file) {
      clearLoadedFile();
      return;
    }

    document.getElementById('editorFileName').value = file.name || '';
    document.getElementById('editorFileLang').value = file.language || '';
    setFileNameError('');

    if (monacoEditor) {
      monacoEditor.updateOptions({ readOnly: false });
      monacoEditor.setValue(file.code || '');
      monaco.editor.setModelLanguage(monacoEditor.getModel(), monacoLangId(file.language || 'python'));
      updateMonacoDecorations();
    }

    document.querySelectorAll('.editor-file-tab').forEach((tab, i) => {
      tab.classList.toggle('active', i === index);
    });
    loading = false;
    persistEditorViewState();
  }

  function saveCurrentFile() {
    if (!deck || !deck.files[fileIndex]) return;
    if (!validateCurrentFileName()) return;
    const file = deck.files[fileIndex];
    const oldName = file.name;
    file.name = fileValidationState.normalizedName || file.name || 'file.txt';
    document.getElementById('editorFileName').value = file.name;
    file.language = document.getElementById('editorFileLang').value || 'python';
    file.code = monacoEditor ? monacoEditor.getValue() : '';

    if (oldName !== file.name) {
      deck.slides.forEach(slide => {
        if (slide.fileId === file.id || (!slide.fileId && slide.fileRef === oldName)) {
          slide.fileRef = file.name;
          slide.fileId = file.id;
        }
      });
      updateFileRefOptions();
    }
  }


  // --- Slide List ---

  function renderSlideList() {
    const list = document.getElementById('editorSlideList');
    list.innerHTML = deck.slides.map((slide, i) => {
      const file = getResolvedSlideFile(slide);
      const lang = file?.language || '';
      const langIcon = getLangIcon(lang);
      const slideLabel = slide.title || '無題';
      return `
      <li class="editor-slide-item ${i === slideIndex ? 'active' : ''}" data-index="${i}" draggable="true" tabindex="0" aria-label="スライド ${i + 1}: ${escapeHtml(slideLabel)}" aria-current="${i === slideIndex ? 'true' : 'false'}">
        <span class="editor-slide-num" title="${escapeHtml(lang)}">${langIcon}</span>
        <div class="editor-slide-info">
          <span class="editor-slide-name">${escapeHtml(slideLabel)}</span>
          <span class="editor-slide-meta">${getSlideMetaText(slide)}</span>
        </div>
        <div class="editor-slide-actions">
          <button class="btn-icon editor-slide-move" data-index="${i}" data-direction="up" title="上へ移動" aria-label="${escapeHtml(slideLabel)} を上へ移動" ${i === 0 ? 'disabled' : ''}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
          </button>
          <button class="btn-icon editor-slide-move" data-index="${i}" data-direction="down" title="下へ移動" aria-label="${escapeHtml(slideLabel)} を下へ移動" ${i === deck.slides.length - 1 ? 'disabled' : ''}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <button class="btn-icon editor-slide-delete" data-index="${i}" title="削除" aria-label="${escapeHtml(slideLabel)} を削除">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </li>`;
    }).join('');

    const moveSlide = (fromIndex, toIndex) => {
      if (toIndex < 0 || toIndex >= deck.slides.length || fromIndex === toIndex) return;
      saveCurrentSlide();
      const [moved] = deck.slides.splice(fromIndex, 1);
      deck.slides.splice(toIndex, 0, moved);

      if (slideIndex === fromIndex) {
        slideIndex = toIndex;
      } else if (fromIndex < slideIndex && toIndex >= slideIndex) {
        slideIndex -= 1;
      } else if (fromIndex > slideIndex && toIndex <= slideIndex) {
        slideIndex += 1;
      }

      renderSlideList();
      loadSlide(slideIndex);
      markDirty();
    };

    // Click to select
    list.querySelectorAll('.editor-slide-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.editor-slide-actions')) return;
        saveCurrentSlide();
        loadSlide(parseInt(item.dataset.index));
      });
      item.addEventListener('keydown', (event) => {
        if (!['Enter', ' ', 'Spacebar'].includes(event.key)) return;
        if (event.target.closest('.editor-slide-actions')) return;
        event.preventDefault();
        saveCurrentSlide();
        loadSlide(parseInt(item.dataset.index));
      });
    });

    list.querySelectorAll('.editor-slide-move').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        const direction = btn.dataset.direction === 'up' ? -1 : 1;
        moveSlide(idx, idx + direction);
      });
    });

    // Delete
    list.querySelectorAll('.editor-slide-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        if (deck.slides.length <= 1) {
          showToast('最後のスライドは削除できません');
          return;
        }
        deck.slides.splice(idx, 1);
        if (slideIndex >= deck.slides.length) {
          slideIndex = deck.slides.length - 1;
        }
        renderSlideList();
        loadSlide(slideIndex);
        markDirty();
      });
    });

    setupSlideDragDrop(list);
  }

  function setupSlideDragDrop(list) {
    let dragSrcIndex = -1;

    function clearDropIndicators() {
      list.querySelectorAll('.drop-above, .drop-below').forEach(el => {
        el.classList.remove('drop-above', 'drop-below');
      });
    }

    list.querySelectorAll('.editor-slide-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        dragSrcIndex = parseInt(item.dataset.index);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragSrcIndex.toString());
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        clearDropIndicators();
        dragSrcIndex = -1;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        clearDropIndicators();
        item.classList.add(e.clientY < midY ? 'drop-above' : 'drop-below');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drop-above', 'drop-below');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        clearDropIndicators();
        const targetIndex = parseInt(item.dataset.index);
        if (dragSrcIndex === -1 || dragSrcIndex === targetIndex) return;

        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        let insertAt = e.clientY < midY ? targetIndex : targetIndex + 1;
        if (dragSrcIndex < insertAt) insertAt--;
        if (dragSrcIndex === insertAt) return;

        saveCurrentSlide();
        const [moved] = deck.slides.splice(dragSrcIndex, 1);
        deck.slides.splice(insertAt, 0, moved);
        markDirty();

        if (slideIndex === dragSrcIndex) {
          slideIndex = insertAt;
        } else if (dragSrcIndex < slideIndex && insertAt >= slideIndex) {
          slideIndex--;
        } else if (dragSrcIndex > slideIndex && insertAt <= slideIndex) {
          slideIndex++;
        }

        renderSlideList();
        loadSlide(slideIndex);
      });
    });
  }

  // --- Slide Editor ---

  function loadSlide(index) {
    loading = true;
    slideIndex = index;
    const slide = deck.slides[index];
    if (!slide) { loading = false; return; }

    const { fileId, fileRef } = syncSlideFileReference(slide, deck.files, {
      fallbackToFirstFile: false,
    });
    slide.fileId = fileId;
    slide.fileRef = fileRef;

    document.getElementById('editorSlideTitle').value = slide.title || '';
    document.getElementById('editorFileRef').value = slide.fileId || '';
    const [lineStart, lineEnd] = slide.lineRange || [1, 1];
    document.getElementById('editorLineStart').value = lineStart;
    document.getElementById('editorLineEnd').value = lineEnd;
    document.getElementById('editorHighlight').value = (slide.highlightLines || []).join(', ');
    markdownEditor?.setValue(slide.markdown || '');

    loadFileById(slide.fileId || '');

    document.querySelectorAll('.editor-slide-item').forEach((item, i) => {
      item.classList.toggle('active', i === index);
      item.setAttribute('aria-current', i === index ? 'true' : 'false');
    });

    updateCodePreview({ saveFile: false, reveal: true });
    updateMarkdownPreview();
    assetsModal?.refreshBrokenReferences();
    loading = false;
    persistEditorViewState();
  }

  function saveCurrentSlide() {
    if (!deck || !deck.slides[slideIndex]) return;
    const slide = deck.slides[slideIndex];
    const fileId = document.getElementById('editorFileRef').value;
    slide.title = document.getElementById('editorSlideTitle').value;
    slide.fileId = hasSelectedFileId(fileId) ? fileId : EMPTY_FILE_ID_VALUE;
    slide.fileRef = getFileById(slide.fileId)?.name || '';
    if (slide.fileId) {
      const lineStart = parseInt(document.getElementById('editorLineStart').value) || 1;
      const lineEnd = parseInt(document.getElementById('editorLineEnd').value) || lineStart;
      slide.lineRange = [lineStart, lineEnd];
      slide.highlightLines = parseHighlightInputText(document.getElementById('editorHighlight').value);
    } else {
      slide.lineRange = [1, 1];
      slide.highlightLines = [];
    }
    slide.markdown = markdownEditor?.getValue() || '';
  }

  function insertAssetReference(assetPath) {
    const reference = `asset://${assetPath}`;
    if (!markdownEditor) return;

    markdownEditor.insertText(reference);

    if (deck?.slides?.[slideIndex]) {
      deck.slides[slideIndex].markdown = markdownEditor.getValue();
    }
    updateMarkdownPreview();
    assetsModal?.refreshBrokenReferences();
    markDirty();
  }

  // --- Live Previews ---

  function updateCodePreview({ saveFile = true, reveal = false } = {}) {
    syncMonacoWithFormState({ saveFile, reveal });
  }

  function updateMarkdownPreview() {
    const md = markdownEditor?.getValue() || '';
    mdPreviewPane.render(md);
  }

  function handleMarkdownChange(value) {
    if (deck?.slides?.[slideIndex]) {
      deck.slides[slideIndex].markdown = value;
    }
    updateMarkdownPreview();
    assetsModal?.refreshBrokenReferences();
    markDirty();
  }

  function applyDeckMetaFromForm() {
    if (!deck) return;

    deck.terminal = {
      cwd: normalizeDeckRelativeDirectory(deck.terminal?.cwd || ''),
    };
  }

  function setEditorDeckName(name) {
    document.getElementById('editorDeckName').textContent = name || '無題のデッキ';
  }

  function replaceHash(path) {
    const nextHash = `#${path}`;
    if (window.location.hash === nextHash) return;
    if (typeof router.replace === 'function') {
      router.replace(path);
      return;
    }
    window.history.replaceState(window.history.state, '', nextHash);
  }

  async function persistDeckToServer(saveVersion) {
    if (!deck) throw new Error('deck-not-loaded');
    if (!validateCurrentFileName()) {
      throw Object.assign(new Error('invalid-file-name'), { status: 400 });
    }

    saveCurrentSlide();
    saveCurrentFile();
    applyDeckMetaFromForm();

    const currentDeckId = persistedDeckId || deck.id;
    const preferredSlideIndex = slideIndex;
    const preferredFileId = deck.files[fileIndex]?.id || '';
    const saved = await api.updateDeck(currentDeckId, deck);
    const reconciliation = reconcileDeckAfterSave({
      currentDeck: deck,
      savedDeck: saved,
      requestDeckId: currentDeckId,
      hasLocalChanges: saveVersion !== changeVersion,
    });
    deck = reconciliation.deck;
    persistedDeckId = reconciliation.persistedDeckId;

    setEditorDeckName(deck.title);
    if (reconciliation.shouldSyncEditor) {
      syncEditorAfterDeckNormalization(preferredFileId, preferredSlideIndex);
    }

    if (reconciliation.renamed) {
      replaceHash(`/deck/${persistedDeckId}/edit`);
    }

    return { renamed: reconciliation.renamed };
  }

  function focusDeckFolderSettingWithError(message) {
    showToast(message);
    deckSettingsController?.openDeckSettingsModal();
    const folderEl = document.getElementById('editorDeckSettingsFolder');
    if (!folderEl) return;
    folderEl.classList.add('modal-input-error');
    folderEl.focus();
  }

  function handlePersistDeckError(err, fallbackMessage) {
    if (err?.message === 'invalid-file-name') {
      showToast(fileValidationState.message || 'ファイル名を確認してください');
      document.getElementById('editorFileName')?.focus();
      return;
    }

    if (err?.status === 409) {
      focusDeckFolderSettingWithError('そのフォルダ名は既に使用されています');
      return;
    }

    if (err?.status === 400) {
      focusDeckFolderSettingWithError('フォルダ名は英数字・ハイフン・アンダースコアのみ使用できます');
      return;
    }

    showToast(fallbackMessage);
  }

  function clearAllHighlightLines() {
    setHighlightInput([]);
    updateCodePreview({ saveFile: false, reveal: false });
    markDirty();
  }

  function removeHighlightRange(start, end) {
    const values = parseHighlightInputText(document.getElementById('editorHighlight').value)
      .filter(line => line < start || line > end);
    setHighlightInput(values);
    updateCodePreview({ saveFile: false, reveal: false });
    markDirty();
  }

  // --- Event Listeners ---

  function setupEventListeners() {
    const debouncedCodePreview = debounce(updateCodePreview, 300);
    const debouncedMarkdownChange = debounce(handleMarkdownChange, 180);

    markdownEditor = createMarkdownEditor({
      parent: document.getElementById('editorMarkdown'),
      placeholderText: 'マークダウンで解説を入力...',
      getAssetSuggestions: () => deck?.assets || [],
      onChange: (value) => {
        debouncedMarkdownChange(value);
      },
    });

    setupEditorLayoutControls({
      getMonacoEditor: () => monacoEditor,
    });
    editorPreferencesModal = initEditorPreferencesModal({
      applyPreferences: (preferences) => {
        applyEditorPreferences(preferences);
        if (dirty) {
          scheduleAutosave();
        }
      },
      showToast,
    });
    deckSettingsController = initEditorDeckSettings({
      api,
      showToast,
      restoreFocus,
      trapFocusInModal,
      getDeck: () => deck,
      markDirty,
      setEditorDeckName,
    });
    setHighlightInputVisible(false);
    assetsModal = initEditorAssetsModal({
      api,
      showToast,
      trapFocusInModal,
      restoreFocus,
      getDeckId: () => persistedDeckId || deck?.id || '',
      getSlides: () => deck?.slides || [],
      getAssets: () => deck?.assets || [],
      setAssets: (assets) => {
        if (!deck) return;
        deck.assets = Array.isArray(assets) ? assets : [];
      },
      insertAssetReference,
    });

    document.getElementById('editorDeckSettingsBtn').addEventListener('click', (event) => {
      editorPreferencesModal?.open(event.currentTarget);
    });

    // File management
    document.getElementById('addFileBtn').addEventListener('click', () => {
      saveCurrentFile();
      const newFile = {
        ...createDefaultFile(deck.files.length),
        name: resolveUniqueFilePath(`file${deck.files.length + 1}.py`, deck.files, `file${deck.files.length + 1}.py`),
        language: 'python',
      };
      deck.files.push(newFile);
      fileIndex = deck.files.length - 1;
      renderFileTabs();
      loadFile(fileIndex);
      markDirty();
    });

    document.getElementById('importFileFromDiskBtn').addEventListener('click', () => {
      document.getElementById('sourceFileInput').click();
    });

    document.getElementById('sourceFileInput').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;
      saveCurrentFile();
      for (const file of files) {
        const code = await file.text();
        const language = detectLanguage(file.name);
        const nextFile = createDefaultFile(deck.files.length);
        deck.files.push({
          ...nextFile,
          name: resolveUniqueFilePath(file.name, deck.files, nextFile.name),
          language,
          code,
        });
      }
      fileIndex = deck.files.length - 1;
      renderFileTabs();
      loadFile(fileIndex);
      showToast(`${files.length} ファイルを読み込みました`);
      e.target.value = '';
      markDirty();
    });

    document.getElementById('deleteFileBtn').addEventListener('click', () => {
      if (deck.files.length <= 1) {
        showToast('最後のファイルは削除できません');
        return;
      }
      const deletedFile = deck.files[fileIndex];
      const deletedName = deck.files[fileIndex].name;
      const deletedId = deletedFile.id;
      deck.files.splice(fileIndex, 1);
      if (fileIndex >= deck.files.length) {
        fileIndex = deck.files.length - 1;
      }
      deck.slides.forEach(slide => {
        if (slide.fileId === deletedId || (!slide.fileId && slide.fileRef === deletedName)) {
          slide.fileId = '';
          slide.fileRef = '';
        }
      });
      renderFileTabs();
      loadFile(fileIndex);
      updateCodePreview();
      markDirty();
    });

    document.getElementById('editorFileName').addEventListener('change', () => {
      if (!validateCurrentFileName()) return;
      saveCurrentFile();
      renderFileTabs();
      renderSlideList();
      updateCodePreview({ saveFile: false, reveal: false });
    });

    document.getElementById('editorFileLang').addEventListener('change', () => {
      saveCurrentFile();
      if (monacoEditor) {
        const lang = document.getElementById('editorFileLang').value || 'python';
        monaco.editor.setModelLanguage(monacoEditor.getModel(), monacoLangId(lang));
      }
    });

    // Slide fields
    document.getElementById('editorFileRef').addEventListener('change', () => {
      const fileId = document.getElementById('editorFileRef').value;
      if (!hasSelectedFileId(fileId)) {
        resetSelectionInputsForNoReference();
      }
      loadFileById(fileId);
      updateCodePreview({ saveFile: false, reveal: true });
      markDirty();
    });
    document.getElementById('resetRangeBtn').addEventListener('click', () => resetRangeToWholeFile());
    document.getElementById('editorLineStart').addEventListener('input', () => { debouncedCodePreview(); markDirty(); });
    document.getElementById('editorLineEnd').addEventListener('input', () => { debouncedCodePreview(); markDirty(); });
    document.getElementById('editorHighlight').addEventListener('input', () => { debouncedCodePreview(); markDirty(); });
    document.getElementById('toggleHighlightInputBtn').addEventListener('click', () => {
      const rowEl = document.getElementById('editorHighlightInputRow');
      const nextVisible = rowEl ? rowEl.hidden : true;
      setHighlightInputVisible(nextVisible);
      if (nextVisible) {
        document.getElementById('editorHighlight').focus();
      }
    });
    document.getElementById('closeHighlightInputBtn').addEventListener('click', () => {
      setHighlightInputVisible(false);
    });
    document.getElementById('clearHighlightBtn').addEventListener('click', () => {
      clearAllHighlightLines();
    });
    document.getElementById('editorHighlightChips').addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-remove-range]');
      if (!removeBtn) return;
      const [startRaw, endRaw] = removeBtn.dataset.removeRange.split(':');
      const start = parseInt(startRaw, 10);
      const end = parseInt(endRaw, 10);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      removeHighlightRange(start, end);
    });
    document.getElementById('editorSlideTitle').addEventListener('input', () => markDirty());
    document.getElementById('editorFileName').addEventListener('input', () => {
      validateCurrentFileName();
      markDirty();
    });
    document.getElementById('editorFileLang').addEventListener('change', () => markDirty());

    // Add slide
    document.getElementById('addSlideBtn').addEventListener('click', () => {
      saveCurrentSlide();
      const firstFile = deck.files[0];
      deck.slides.push(createDefaultSlide(
        deck.slides.length,
        firstFile ? firstFile.name : '',
        firstFile ? firstFile.id : '',
      ));
      slideIndex = deck.slides.length - 1;
      renderSlideList();
      loadSlide(slideIndex);
      markDirty();
    });

    // Save deck
    document.getElementById('editorSaveBtn').addEventListener('click', async () => {
      try {
        await requestPersistDeck({
          source: 'manual',
          fallbackMessage: '保存に失敗しました',
          notifyOnSuccess: true,
          surfaceErrors: true,
        });
      } catch {
        // Errors are surfaced by requestPersistDeck.
      }
    });

    // Preview button (auto-save before navigating)
    document.getElementById('editorPreviewBtn').addEventListener('click', async () => {
      try {
        await requestPersistDeck({
          source: 'preview',
          fallbackMessage: '保存に失敗したため、プレビューに移動できませんでした',
          notifyOnSuccess: false,
          surfaceErrors: true,
        });
      } catch {
        return;
      }
      if (deck) router.navigate(`/deck/${deck.id}`);
    });

  }

  // --- Monaco Editor Init ---

  function initMonaco() {
    if (monacoEditor) return;
    ensureMonacoThemes();
    const container = document.getElementById('editorFileCode');
    monacoEditor = monaco.editor.create(container, {
      value: '',
      language: 'python',
      theme: document.documentElement.getAttribute('data-theme') === 'light' ? MONACO_THEME.light : MONACO_THEME.dark,
      minimap: { enabled: editorPreferences.minimap },
      glyphMargin: true,
      fontSize: editorPreferences.fontSize,
      lineNumbers: editorPreferences.lineNumbers,
      scrollBeyondLastLine: false,
      automaticLayout: false,
      wordWrap: editorPreferences.wordWrap,
      tabSize: editorPreferences.tabSize,
      renderLineHighlight: 'all',
      bracketPairColorization: { enabled: true },
      padding: { top: 8, bottom: 8 },
    });

    monacoEditor.onDidChangeModelContent(debounce((event) => {
      if (loading || event?.isFlush) return;
      saveCurrentFile();
      updateCodePreview();
      markDirty();
    }, 300));

    const lineNumberTargetType = monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS;
    const glyphTargetType = monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN;

    let rangePointerDown = false;
    let rangeDragChanged = false;
    let rangeStartLine = -1;
    let rangeAnchorLine = null;
    let highlightPointerDown = false;
    let highlightDragMode = null;
    let lastHighlightDragLine = -1;

    const applyRangePreview = (lineA, lineB) => {
      const start = Math.min(lineA, lineB);
      const end = Math.max(lineA, lineB);
      setLineRangeInputs(start, end);
      syncMonacoWithFormState({ saveFile: false, reveal: false });
    };

    const canEditCurrentSlideFile = () => {
      if (!deck) return false;
      const activeFile = deck.files[fileIndex];
      const fileId = document.getElementById('editorFileRef').value;
      return Boolean(activeFile && activeFile.id === fileId);
    };

    const setHighlightLine = (line, shouldHighlight) => {
      const values = parseHighlightInputText(document.getElementById('editorHighlight').value);
      const hasLine = values.includes(line);
      if (shouldHighlight && !hasLine) {
        values.push(line);
      } else if (!shouldHighlight && hasLine) {
        const idx = values.indexOf(line);
        values.splice(idx, 1);
      } else {
        return false;
      }

      values.sort((a, b) => a - b);
      setHighlightInput(values);
      syncMonacoWithFormState({ saveFile: false, reveal: false });
      return true;
    };

    const finishPointerInteractions = () => {
      if (highlightPointerDown) {
        highlightPointerDown = false;
        highlightDragMode = null;
        lastHighlightDragLine = -1;
      }

      if (rangePointerDown) {
        const didRangeChange = rangeDragChanged;
        rangePointerDown = false;
        rangeDragChanged = false;
        rangeStartLine = -1;
        document.body.classList.remove('resizing-v');
        if (didRangeChange) {
          syncMonacoWithFormState({ saveFile: false, reveal: false });
          markDirty();
        }
      }
    };

    monacoEditor.onMouseDown((e) => {
      if (![glyphTargetType, lineNumberTargetType].includes(e.target.type)) return;

      const line = e.target.position?.lineNumber;
      if (!line || !canEditCurrentSlideFile()) return;

      if (e.target.type === glyphTargetType) {
        e.event.preventDefault();
        const existing = parseHighlightInputText(document.getElementById('editorHighlight').value);
        highlightDragMode = existing.includes(line) ? 'remove' : 'add';
        highlightPointerDown = true;
        lastHighlightDragLine = -1;
        if (setHighlightLine(line, highlightDragMode === 'add')) {
          markDirty();
        }
        return;
      }

      if (e.event.shiftKey && Number.isFinite(rangeAnchorLine)) {
        e.event.preventDefault();
        applyRangePreview(rangeAnchorLine, line);
        markDirty();
        rangeAnchorLine = line;
        return;
      }

      e.event.preventDefault();
      rangePointerDown = true;
      rangeDragChanged = false;
      rangeStartLine = line;
      rangeAnchorLine = line;
    });

    monacoEditor.onMouseMove((e) => {
      const line = e.target.position?.lineNumber;
      if (!line) return;

      if (highlightPointerDown) {
        if (!canEditCurrentSlideFile()) return;
        if (line === lastHighlightDragLine) return;
        lastHighlightDragLine = line;
        if (setHighlightLine(line, highlightDragMode === 'add')) {
          markDirty();
        }
        return;
      }

      if (!rangePointerDown) return;
      if (!rangeDragChanged && line === rangeStartLine) return;

      if (!rangeDragChanged) {
        document.body.classList.add('resizing-v');
      }
      rangeDragChanged = true;
      applyRangePreview(rangeStartLine, line);
    });

    window.addEventListener('mouseup', finishPointerInteractions);

    const resizeObserver = new ResizeObserver(() => monacoEditor?.layout());
    resizeObserver.observe(container);
  }

  // --- Public API ---

  // Setup once
  setupEventListeners();

  async function show(deckId) {
    const requestId = ++showRequestId;
    clearAutosaveTimer();
    clearDirty();
    changeVersion = 0;
    setSaveStatus('saved');
    persistedDeckId = null;
    try {
      loading = true;
      const loadedDeck = await api.getDeck(deckId);
      if (requestId !== showRequestId) return;
      deck = loadedDeck;
      ensureDeckShape(deck);
      persistedDeckId = deck.id;
      slideIndex = 0;
      fileIndex = 0;
      setEditorDeckName(deck.title);
      recordRecentDeck({ id: deck.id, title: deck.title });

      const restoredState = getLastEditorState(deck.id);
      const restoredSlideIndex = restoredState
        ? Math.min(restoredState.slideIndex, Math.max(deck.slides.length - 1, 0))
        : 0;

      initMonaco();
      syncEditorAfterDeckNormalization(restoredState?.fileId || '', restoredSlideIndex);
      clearDirty();
      changeVersion = 0;
      setSaveStatus('saved');
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    } catch {
      if (requestId !== showRequestId) return;
      setSaveStatus('error');
      showToast('デッキの読み込みに失敗しました');
      router.navigate('/');
    } finally {
      if (requestId === showRequestId) {
        loading = false;
      }
    }
  }

  return {
    show,
    hasUnsavedChanges,
    confirmLeave,
    get monacoEditor() { return monacoEditor; },
    applyTheme(isDark) {
      if (monacoEditor) monaco.editor.setTheme(isDark ? MONACO_THEME.dark : MONACO_THEME.light);

      const currentSlide = deck?.slides?.[slideIndex];
      if (!currentSlide) return;

      const markdown = markdownEditor ? markdownEditor.getValue() : (currentSlide.markdown || '');
      mdPreviewPane.render(markdown);
    },
  };
}
