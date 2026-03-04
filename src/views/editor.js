/**
 * Editor View
 * Deck editor with Monaco Editor, file management, and slide editing
 */

import * as api from '../core/api.js';
import * as monaco from 'monaco-editor';
import { MarkdownPane } from '../panes/markdown.js';
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
    dark: 'codestage-dark',
    light: 'vs',
  };

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
  let slideIndex = 0;
  let fileIndex = 0;
  let monacoEditor = null;
  let monacoDecorations = [];
  let dirty = false;
  let loading = false;

  const mdPreviewPane = new MarkdownPane(document.getElementById('editorMarkdownPreview'));

  // --- Dirty state ---

  function markDirty() {
    if (dirty || loading) return;
    dirty = true;
    document.getElementById('editorSaveBtn').classList.add('has-changes');
  }

  function clearDirty() {
    dirty = false;
    document.getElementById('editorSaveBtn').classList.remove('has-changes');
  }

  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // --- File Tabs ---

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
    select.innerHTML = deck.files.map(f =>
      `<option value="${escapeHtml(f.name)}">${escapeHtml(f.name)}</option>`
    ).join('');
    if (currentVal && deck.files.some(f => f.name === currentVal)) {
      select.value = currentVal;
    }
  }

  function loadFile(index) {
    loading = true;
    fileIndex = index;
    const file = deck.files[index];
    if (!file) {
      document.getElementById('editorFileName').value = '';
      document.getElementById('editorFileLang').value = '';
      if (monacoEditor) monacoEditor.setValue('');
      loading = false;
      return;
    }

    document.getElementById('editorFileName').value = file.name || '';
    document.getElementById('editorFileLang').value = file.language || '';

    if (monacoEditor) {
      monacoEditor.setValue(file.code || '');
      monaco.editor.setModelLanguage(monacoEditor.getModel(), monacoLangId(file.language || 'python'));
      updateMonacoDecorations();
    }

    document.querySelectorAll('.editor-file-tab').forEach((tab, i) => {
      tab.classList.toggle('active', i === index);
    });
    loading = false;
  }

  function saveCurrentFile() {
    if (!deck || !deck.files[fileIndex]) return;
    const file = deck.files[fileIndex];
    const oldName = file.name;
    file.name = document.getElementById('editorFileName').value || '無名';
    file.language = document.getElementById('editorFileLang').value || 'python';
    file.code = monacoEditor ? monacoEditor.getValue() : '';

    if (oldName !== file.name) {
      deck.slides.forEach(slide => {
        if (slide.fileRef === oldName) slide.fileRef = file.name;
      });
      updateFileRefOptions();
    }
  }

  function parseHighlightLinesInput(text) {
    if (!text) return [];
    const values = new Set();
    text.split(',').forEach((part) => {
      const line = parseInt(part.trim(), 10);
      if (!Number.isFinite(line) || line < 1) return;
      values.add(line);
    });
    return Array.from(values).sort((a, b) => a - b);
  }

  function normalizeLineRangeForFile(lineRange, file) {
    const maxLine = Math.max((file?.code || '').split('\n').length, 1);
    let start = parseInt(Array.isArray(lineRange) ? lineRange[0] : undefined, 10);
    let end = parseInt(Array.isArray(lineRange) ? lineRange[1] : undefined, 10);

    if (!Number.isFinite(start) || start < 1) start = 1;
    if (!Number.isFinite(end) || end < start) end = start;

    start = Math.min(start, maxLine);
    end = Math.min(end, maxLine);
    return [start, end];
  }

  function getDraftSlideStateFromForm() {
    const fileRef = document.getElementById('editorFileRef').value;
    const lineStart = parseInt(document.getElementById('editorLineStart').value, 10);
    const lineEnd = parseInt(document.getElementById('editorLineEnd').value, 10);

    return {
      fileRef,
      lineRange: [
        Number.isFinite(lineStart) ? lineStart : 1,
        Number.isFinite(lineEnd) ? lineEnd : (Number.isFinite(lineStart) ? lineStart : 1),
      ],
      highlightLines: parseHighlightLinesInput(document.getElementById('editorHighlight').value),
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

  function compactLineGroups(lines) {
    if (!lines.length) return [];

    const groups = [];
    let start = lines[0];
    let prev = lines[0];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line === prev + 1) {
        prev = line;
        continue;
      }
      groups.push({ start, end: prev });
      start = line;
      prev = line;
    }

    groups.push({ start, end: prev });
    return groups;
  }

  function renderRangeSummary(slideState = null) {
    const summaryEl = document.getElementById('editorRangeSummary');
    if (!summaryEl) return;

    const draft = slideState || getDraftSlideStateFromForm();
    const result = normalizeDraftSlideState(draft);
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
    const lines = [...(draft.highlightLines || [])].sort((a, b) => a - b);
    const groups = compactLineGroups(lines);

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
          <button class="editor-highlight-chip-remove" data-remove-range="${group.start}:${group.end}" title="この範囲を解除">x</button>
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

    const fileRef = document.getElementById('editorFileRef').value;
    const targetFile = deck.files.find(file => file.name === fileRef);
    if (!targetFile) return;

    const maxLine = Math.max((targetFile.code || '').split('\n').length, 1);
    setLineRangeInputs(1, maxLine);
    updateCodePreview({ saveFile: false, reveal: false });
    markDirty();
  }

  function normalizeDraftSlideState(draft) {
    if (!deck) return null;

    const targetFile = deck.files.find(file => file.name === draft.fileRef);
    if (!targetFile) return null;

    const [start, end] = normalizeLineRangeForFile(draft.lineRange, targetFile);
    const highlightLines = Array.from(
      new Set((draft.highlightLines || []).map(line => parseInt(line, 10)).filter(line => Number.isFinite(line) && line >= 1)),
    ).sort((a, b) => a - b);
    return {
      targetFile,
      normalized: {
        ...draft,
        lineRange: [start, end],
        highlightLines,
      },
    };
  }

  function syncMonacoWithFormState({ saveFile = false, reveal = false } = {}) {
    if (!deck) return;

    if (saveFile) saveCurrentFile();

    const draft = getDraftSlideStateFromForm();
    const result = normalizeDraftSlideState(draft);
    if (!result) {
      updateMonacoDecorations();
      refreshSelectionWidgets();
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
    if (reveal && monacoEditor && currentFile && currentFile.name === targetFile.name) {
      monacoEditor.revealLineInCenter(normalized.lineRange[0]);
    }
  }

  function loadFileByName(fileName) {
    const nextIndex = deck.files.findIndex(file => file.name === fileName);
    if (nextIndex < 0 || nextIndex === fileIndex) return;
    saveCurrentFile();
    loadFile(nextIndex);
  }

  function updateMonacoDecorations(slideState = null) {
    if (!monacoEditor || !deck) return;

    const slide = slideState || deck.slides[slideIndex];
    const file = deck.files[fileIndex];
    if (!slide || !file || slide.fileRef !== file.name) {
      monacoDecorations = monacoEditor.deltaDecorations(monacoDecorations, []);
      return;
    }

    const [start, end] = normalizeLineRangeForFile(slide.lineRange || [1, 1], file);
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

  // --- Slide List ---

  function renderSlideList() {
    const list = document.getElementById('editorSlideList');
    list.innerHTML = deck.slides.map((slide, i) => {
      const lr = slide.lineRange || [1, 1];
      const fileRef = slide.fileRef || '';
      const file = deck.files?.find(f => f.name === fileRef);
      const lang = file?.language || '';
      const langIcon = getLangIcon(lang);
      return `
      <li class="editor-slide-item ${i === slideIndex ? 'active' : ''}" data-index="${i}" draggable="true">
        <span class="editor-slide-num" title="${escapeHtml(lang)}">${langIcon}</span>
        <div class="editor-slide-info">
          <span class="editor-slide-name">${escapeHtml(slide.title || '無題')}</span>
          <span class="editor-slide-meta">${escapeHtml(fileRef)} L${lr[0]}–${lr[1]}</span>
        </div>
        <button class="btn-icon editor-slide-delete" data-index="${i}" title="削除">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </li>`;
    }).join('');

    // Click to select
    list.querySelectorAll('.editor-slide-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.editor-slide-delete')) return;
        saveCurrentSlide();
        loadSlide(parseInt(item.dataset.index));
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

    document.getElementById('editorSlideTitle').value = slide.title || '';
    document.getElementById('editorFileRef').value = slide.fileRef || '';
    const [lineStart, lineEnd] = slide.lineRange || [1, 1];
    document.getElementById('editorLineStart').value = lineStart;
    document.getElementById('editorLineEnd').value = lineEnd;
    document.getElementById('editorHighlight').value = (slide.highlightLines || []).join(', ');
    document.getElementById('editorMarkdown').value = slide.markdown || '';

    loadFileByName(slide.fileRef || '');

    document.querySelectorAll('.editor-slide-item').forEach((item, i) => {
      item.classList.toggle('active', i === index);
    });

    updateCodePreview({ saveFile: false, reveal: true });
    updateMarkdownPreview();
    loading = false;
  }

  function saveCurrentSlide() {
    if (!deck || !deck.slides[slideIndex]) return;
    const slide = deck.slides[slideIndex];
    slide.title = document.getElementById('editorSlideTitle').value;
    slide.fileRef = document.getElementById('editorFileRef').value;
    const lineStart = parseInt(document.getElementById('editorLineStart').value) || 1;
    const lineEnd = parseInt(document.getElementById('editorLineEnd').value) || lineStart;
    slide.lineRange = [lineStart, lineEnd];
    slide.markdown = document.getElementById('editorMarkdown').value;
    slide.highlightLines = parseHighlightLinesInput(document.getElementById('editorHighlight').value);
  }

  // --- Live Previews ---

  function updateCodePreview({ saveFile = true, reveal = false } = {}) {
    syncMonacoWithFormState({ saveFile, reveal });
  }

  function updateMarkdownPreview() {
    const md = document.getElementById('editorMarkdown').value;
    mdPreviewPane.render(md);
  }

  function applyDeckMetaFromForm() {
    if (!deck) return;

    deck.title = document.getElementById('editorDeckTitle').value || '無題のデッキ';
    deck.description = document.getElementById('editorDeckDesc').value || '';
    deck.terminal = {
      cwd: document.getElementById('editorTerminalCwd').value.trim(),
    };
  }

  function clearAllHighlightLines() {
    setHighlightInput([]);
    updateCodePreview({ saveFile: false, reveal: false });
    markDirty();
  }

  function removeHighlightRange(start, end) {
    const values = parseHighlightLinesInput(document.getElementById('editorHighlight').value)
      .filter(line => line < start || line > end);
    setHighlightInput(values);
    updateCodePreview({ saveFile: false, reveal: false });
    markDirty();
  }

  function setupEditorResizer() {
    const bodyEl = document.querySelector('.editor-body');
    const sidebarEl = document.querySelector('.editor-sidebar');
    const resizerEl = document.getElementById('editorMainNarrativeResizer');
    if (!bodyEl || !sidebarEl || !resizerEl) return;

    const STORAGE_KEY = 'codestage-editor-narrative-width';
    const minNarrativeWidth = 260;
    const minMainWidth = 420;
    const splitterSize = 8;

    const clampWidth = (rawWidth) => {
      if (window.matchMedia('(max-width: 1080px)').matches) {
        return Math.max(rawWidth, minNarrativeWidth);
      }

      const bodyWidth = bodyEl.getBoundingClientRect().width;
      const collapsed = bodyEl.classList.contains('sidebar-collapsed');
      const sidebarWidth = collapsed ? 0 : sidebarEl.getBoundingClientRect().width;
      const leftSplitterWidth = splitterSize;
      const rightSplitterWidth = splitterSize;
      const gap = parseFloat(getComputedStyle(bodyEl).columnGap) || 0;
      const gapCount = collapsed ? 3 : 4;
      const totalGap = gap * gapCount;
      const maxNarrativeWidth = Math.max(
        minNarrativeWidth,
        bodyWidth - sidebarWidth - leftSplitterWidth - minMainWidth - rightSplitterWidth - totalGap,
      );
      return Math.min(Math.max(rawWidth, minNarrativeWidth), maxNarrativeWidth);
    };

    const applyWidth = (width, persist = false) => {
      const clamped = clampWidth(width);
      bodyEl.style.setProperty('--editor-narrative-width', `${clamped}px`);
      if (persist) {
        localStorage.setItem(STORAGE_KEY, String(Math.round(clamped)));
      }
    };

    const savedWidth = parseInt(localStorage.getItem(STORAGE_KEY), 10);
    if (Number.isFinite(savedWidth)) {
      bodyEl.style.setProperty('--editor-narrative-width', `${savedWidth}px`);
    }

    let dragging = false;

    const onMouseMove = (e) => {
      if (!dragging) return;
      const rect = bodyEl.getBoundingClientRect();
      const nextWidth = rect.right - e.clientX;
      applyWidth(nextWidth);
      if (monacoEditor) monacoEditor.layout();
    };

    const onMouseUp = (e) => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('resizing-h');
      resizerEl.classList.remove('dragging');

      const rect = bodyEl.getBoundingClientRect();
      const nextWidth = rect.right - e.clientX;
      applyWidth(nextWidth, true);

      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (monacoEditor) monacoEditor.layout();
    };

    resizerEl.addEventListener('mousedown', (e) => {
      if (window.matchMedia('(max-width: 1080px)').matches) return;
      e.preventDefault();
      dragging = true;
      document.body.classList.add('resizing-h');
      resizerEl.classList.add('dragging');
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    window.addEventListener('resize', () => {
      const current = parseInt(bodyEl.style.getPropertyValue('--editor-narrative-width'), 10);
      if (Number.isFinite(current)) {
        applyWidth(current);
      }
      if (monacoEditor) monacoEditor.layout();
    });
  }

  function setupSidebarHandle() {
    const bodyEl = document.querySelector('.editor-body');
    const sidebarEl = document.querySelector('.editor-sidebar');
    const sidebarResizerEl = document.getElementById('editorSidebarResizer');
    const sidebarHandleBtn = document.getElementById('editorSidebarHandle');
    if (!bodyEl || !sidebarEl || !sidebarResizerEl || !sidebarHandleBtn) return;

    const WIDTH_KEY = 'codestage-editor-sidebar-width';
    const COLLAPSED_KEY = 'codestage-editor-sidebar-collapsed';
    const minSidebarWidth = 220;
    const minMainWidth = 420;
    const splitterSize = 8;

    const clampSidebarWidth = (rawWidth) => {
      if (window.matchMedia('(max-width: 860px)').matches) {
        return rawWidth;
      }

      const isDesktopWide = !window.matchMedia('(max-width: 1080px)').matches;
      const bodyWidth = bodyEl.getBoundingClientRect().width;
      const narrativeWidth = isDesktopWide
        ? document.querySelector('.editor-narrative')?.getBoundingClientRect().width || 0
        : 0;
      const rightSplitterWidth = isDesktopWide ? splitterSize : 0;
      const gap = parseFloat(getComputedStyle(bodyEl).columnGap) || 0;
      const gapCount = isDesktopWide ? 4 : 2;
      const totalGap = gap * gapCount;
      const maxSidebarWidth = Math.max(
        minSidebarWidth,
        bodyWidth - minMainWidth - narrativeWidth - rightSplitterWidth - splitterSize - totalGap,
      );
      return Math.min(Math.max(rawWidth, minSidebarWidth), maxSidebarWidth);
    };

    const applySidebarWidth = (width, persist = false) => {
      const clamped = clampSidebarWidth(width);
      bodyEl.style.setProperty('--editor-sidebar-width', `${clamped}px`);
      if (persist) {
        localStorage.setItem(WIDTH_KEY, String(Math.round(clamped)));
      }
    };

    const setCollapsed = (collapsed, persist = false) => {
      bodyEl.classList.toggle('sidebar-collapsed', collapsed);
      sidebarHandleBtn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
      sidebarHandleBtn.title = collapsed ? '左パネルを表示' : '左パネルを隠す';
      sidebarHandleBtn.setAttribute('aria-label', collapsed ? '左パネルを表示' : '左パネルを隠す');

      if (persist) {
        localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
      }

      window.dispatchEvent(new Event('resize'));
      if (monacoEditor) monacoEditor.layout();
    };

    const savedWidth = parseInt(localStorage.getItem(WIDTH_KEY), 10);
    if (Number.isFinite(savedWidth)) {
      bodyEl.style.setProperty('--editor-sidebar-width', `${savedWidth}px`);
    }

    const initialCollapsed = localStorage.getItem(COLLAPSED_KEY) === '1';
    setCollapsed(initialCollapsed);

    let dragging = false;

    const onMouseMove = (e) => {
      if (!dragging) return;

      const rect = bodyEl.getBoundingClientRect();
      const nextWidth = e.clientX - rect.left;

      if (bodyEl.classList.contains('sidebar-collapsed')) {
        setCollapsed(false, false);
      }

      applySidebarWidth(nextWidth);
      if (monacoEditor) monacoEditor.layout();
    };

    const onMouseUp = (e) => {
      if (!dragging) return;

      dragging = false;
      document.body.classList.remove('resizing-h');
      sidebarResizerEl.classList.remove('dragging');

      const rect = bodyEl.getBoundingClientRect();
      const nextWidth = e.clientX - rect.left;
      applySidebarWidth(nextWidth, true);

      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (monacoEditor) monacoEditor.layout();
    };

    sidebarResizerEl.addEventListener('mousedown', (e) => {
      if (window.matchMedia('(max-width: 860px)').matches) return;
      if (e.target === sidebarHandleBtn || sidebarHandleBtn.contains(e.target)) return;

      e.preventDefault();
      dragging = true;
      document.body.classList.add('resizing-h');
      sidebarResizerEl.classList.add('dragging');
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    sidebarResizerEl.addEventListener('dblclick', () => {
      if (window.matchMedia('(max-width: 860px)').matches) return;
      const nextCollapsed = !bodyEl.classList.contains('sidebar-collapsed');
      setCollapsed(nextCollapsed, true);
    });

    sidebarHandleBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    sidebarHandleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nextCollapsed = !bodyEl.classList.contains('sidebar-collapsed');
      setCollapsed(nextCollapsed, true);
    });

    window.addEventListener('resize', () => {
      const current = parseInt(bodyEl.style.getPropertyValue('--editor-sidebar-width'), 10);
      if (Number.isFinite(current)) {
        applySidebarWidth(current);
      }
    });
  }

  function setupMarkdownResizer() {
    const containerEl = document.querySelector('.editor-fields-markdown');
    const resizerEl = document.getElementById('editorMarkdownResizer');
    if (!containerEl || !resizerEl) return;

    const STORAGE_KEY = 'codestage-editor-markdown-input-height';
    const minInputHeight = 140;
    const minPreviewHeight = 140;
    const splitterSize = 8;

    const clampHeight = (rawHeight) => {
      const total = containerEl.getBoundingClientRect().height;
      const maxInputHeight = Math.max(minInputHeight, total - minPreviewHeight - splitterSize);
      return Math.min(Math.max(rawHeight, minInputHeight), maxInputHeight);
    };

    const applyHeight = (height, persist = false) => {
      const clamped = clampHeight(height);
      containerEl.style.setProperty('--editor-markdown-input-height', `${clamped}px`);
      if (persist) {
        localStorage.setItem(STORAGE_KEY, String(Math.round(clamped)));
      }
    };

    const savedHeight = parseInt(localStorage.getItem(STORAGE_KEY), 10);
    if (Number.isFinite(savedHeight)) {
      containerEl.style.setProperty('--editor-markdown-input-height', `${savedHeight}px`);
    }

    let dragging = false;

    const onMouseMove = (e) => {
      if (!dragging) return;
      const rect = containerEl.getBoundingClientRect();
      const nextHeight = e.clientY - rect.top;
      applyHeight(nextHeight);
    };

    const onMouseUp = (e) => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('resizing-v');
      resizerEl.classList.remove('dragging');

      const rect = containerEl.getBoundingClientRect();
      const nextHeight = e.clientY - rect.top;
      applyHeight(nextHeight, true);

      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    resizerEl.addEventListener('mousedown', (e) => {
      if (window.matchMedia('(max-width: 860px)').matches) return;
      e.preventDefault();
      dragging = true;
      document.body.classList.add('resizing-v');
      resizerEl.classList.add('dragging');
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    window.addEventListener('resize', () => {
      const current = parseInt(containerEl.style.getPropertyValue('--editor-markdown-input-height'), 10);
      if (Number.isFinite(current)) {
        applyHeight(current);
      }
    });
  }

  // --- Event Listeners ---

  function setupEventListeners() {
    const debouncedCodePreview = debounce(updateCodePreview, 300);
    const debouncedMarkdownPreview = debounce(updateMarkdownPreview, 300);

    setupEditorResizer();
    setupMarkdownResizer();
    setupSidebarHandle();
    setHighlightInputVisible(false);

    // File management
    document.getElementById('addFileBtn').addEventListener('click', () => {
      saveCurrentFile();
      const newName = `file${deck.files.length + 1}.py`;
      deck.files.push({ name: newName, language: 'python', code: '' });
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
        deck.files.push({ name: file.name, language, code });
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
      const deletedName = deck.files[fileIndex].name;
      deck.files.splice(fileIndex, 1);
      if (fileIndex >= deck.files.length) {
        fileIndex = deck.files.length - 1;
      }
      deck.slides.forEach(slide => {
        if (slide.fileRef === deletedName) slide.fileRef = '';
      });
      renderFileTabs();
      loadFile(fileIndex);
      updateCodePreview();
      markDirty();
    });

    document.getElementById('editorFileName').addEventListener('change', () => {
      saveCurrentFile();
      renderFileTabs();
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
      loadFileByName(document.getElementById('editorFileRef').value);
      updateCodePreview({ saveFile: false, reveal: true });
      markDirty();
    });
    document.getElementById('resetRangeBtn').addEventListener('click', () => resetRangeToWholeFile());
    document.getElementById('editorLineStart').addEventListener('input', () => { debouncedCodePreview(); markDirty(); });
    document.getElementById('editorLineEnd').addEventListener('input', () => { debouncedCodePreview(); markDirty(); });
    document.getElementById('editorHighlight').addEventListener('input', () => { debouncedCodePreview(); markDirty(); });
    document.getElementById('editorMarkdown').addEventListener('input', () => { debouncedMarkdownPreview(); markDirty(); });
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
    document.getElementById('editorDeckTitle').addEventListener('input', () => markDirty());
    document.getElementById('editorDeckDesc').addEventListener('input', () => markDirty());
    document.getElementById('editorTerminalCwd').addEventListener('input', () => markDirty());
    document.getElementById('editorSlideTitle').addEventListener('input', () => markDirty());
    document.getElementById('editorFileName').addEventListener('input', () => markDirty());
    document.getElementById('editorFileLang').addEventListener('change', () => markDirty());

    // Add slide
    document.getElementById('addSlideBtn').addEventListener('click', () => {
      saveCurrentSlide();
      const firstFile = deck.files[0];
      deck.slides.push({
        title: `スライド ${deck.slides.length + 1}`,
        fileRef: firstFile ? firstFile.name : '',
        lineRange: [1, 1],
        highlightLines: [],
        markdown: '',
      });
      slideIndex = deck.slides.length - 1;
      renderSlideList();
      loadSlide(slideIndex);
      markDirty();
    });

    // Save deck
    document.getElementById('editorSaveBtn').addEventListener('click', async () => {
      saveCurrentSlide();
      saveCurrentFile();
      applyDeckMetaFromForm();
      try {
        await api.updateDeck(deck.id, deck);
        clearDirty();
        showToast('保存しました');
        renderSlideList();
      } catch {
        showToast('保存に失敗しました');
      }
    });

    // Preview button (auto-save before navigating)
    document.getElementById('editorPreviewBtn').addEventListener('click', async () => {
      saveCurrentSlide();
      saveCurrentFile();
      applyDeckMetaFromForm();
      try {
        await api.updateDeck(deck.id, deck);
        clearDirty();
      } catch {
        showToast('保存に失敗したため、プレビューに移動できませんでした');
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
      minimap: { enabled: false },
      glyphMargin: true,
      fontSize: 13,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: false,
      wordWrap: 'on',
      tabSize: 4,
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
      const fileRef = document.getElementById('editorFileRef').value;
      return Boolean(activeFile && activeFile.name === fileRef);
    };

    const setHighlightLine = (line, shouldHighlight) => {
      const values = parseHighlightLinesInput(document.getElementById('editorHighlight').value);
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
        const existing = parseHighlightLinesInput(document.getElementById('editorHighlight').value);
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
    clearDirty();
    try {
      loading = true;
      deck = await api.getDeck(deckId);
      if (!deck.files || deck.files.length === 0) {
        deck.files = [{ name: 'main.py', language: 'python', code: '' }];
      }
      if (!deck.slides || deck.slides.length === 0) {
        deck.slides = [{
          title: 'スライド 1',
          fileRef: deck.files[0].name,
          lineRange: [1, 1],
          highlightLines: [],
          markdown: '',
        }];
      }
      if (!deck.terminal || typeof deck.terminal !== 'object') {
        deck.terminal = { cwd: '' };
      }
      if (typeof deck.terminal.cwd !== 'string') {
        deck.terminal.cwd = '';
      }
      slideIndex = 0;
      fileIndex = 0;
      document.getElementById('editorDeckTitle').value = deck.title || '';
      document.getElementById('editorDeckDesc').value = deck.description || '';
      document.getElementById('editorTerminalCwd').value = deck.terminal.cwd || '';

      initMonaco();
      renderFileTabs();
      loadFile(0);
      renderSlideList();
      loadSlide(0);
      clearDirty();
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    } catch {
      showToast('デッキの読み込みに失敗しました');
      router.navigate('/');
    } finally {
      loading = false;
    }
  }

  return {
    show,
    get monacoEditor() { return monacoEditor; },
    setMonacoTheme(isDark) {
      if (monacoEditor) monaco.editor.setTheme(isDark ? MONACO_THEME.dark : MONACO_THEME.light);
    },
  };
}
