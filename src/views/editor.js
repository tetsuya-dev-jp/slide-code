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

  function normalizeDraftSlideState(draft) {
    if (!deck) return null;

    const targetFile = deck.files.find(file => file.name === draft.fileRef);
    if (!targetFile) return null;

    const [start, end] = normalizeLineRangeForFile(draft.lineRange, targetFile);
    return {
      targetFile,
      normalized: {
        ...draft,
        lineRange: [start, end],
        highlightLines: draft.highlightLines.filter(line => line >= start && line <= end),
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
      .filter(line => Number.isFinite(line) && line >= start && line <= end);

    const newDecorations = [{
      range: new monaco.Range(start, 1, end, 1),
      options: {
        isWholeLine: true,
        className: 'monaco-range-line',
      },
    }, ...highlightLines.map(line => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: 'monaco-hl-line',
        glyphMarginClassName: 'monaco-hl-glyph',
      },
    }))];

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

    updateCodePreview();
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

  function updateCodePreview() {
    syncMonacoWithFormState({ saveFile: true, reveal: true });
  }

  function updateMarkdownPreview() {
    const md = document.getElementById('editorMarkdown').value;
    mdPreviewPane.render(md);
  }

  function applyMonacoSelectionToLineRange() {
    if (!monacoEditor) return;

    const selection = monacoEditor.getSelection();
    if (!selection) return;

    const start = Math.min(selection.startLineNumber, selection.endLineNumber);
    const end = Math.max(selection.startLineNumber, selection.endLineNumber);

    document.getElementById('editorLineStart').value = start;
    document.getElementById('editorLineEnd').value = end;
    updateCodePreview();
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
      const bodyWidth = bodyEl.getBoundingClientRect().width;
      const sidebarWidth = sidebarEl.getBoundingClientRect().width;
      const maxNarrativeWidth = Math.max(
        minNarrativeWidth,
        bodyWidth - sidebarWidth - minMainWidth - splitterSize - 16,
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
      applyWidth(savedWidth);
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

  // --- Event Listeners ---

  function setupEventListeners() {
    const debouncedCodePreview = debounce(updateCodePreview, 300);
    const debouncedMarkdownPreview = debounce(updateMarkdownPreview, 300);

    setupEditorResizer();

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
      updateCodePreview();
      markDirty();
    });
    document.getElementById('editorLineStart').addEventListener('input', () => { debouncedCodePreview(); markDirty(); });
    document.getElementById('editorLineEnd').addEventListener('input', () => { debouncedCodePreview(); markDirty(); });
    document.getElementById('editorHighlight').addEventListener('input', () => { debouncedCodePreview(); markDirty(); });
    document.getElementById('editorMarkdown').addEventListener('input', () => { debouncedMarkdownPreview(); markDirty(); });
    document.getElementById('applySelectionToRangeBtn').addEventListener('click', () => applyMonacoSelectionToLineRange());
    document.getElementById('editorDeckTitle').addEventListener('input', () => markDirty());
    document.getElementById('editorDeckDesc').addEventListener('input', () => markDirty());
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
      deck.title = document.getElementById('editorDeckTitle').value || '無題のデッキ';
      deck.description = document.getElementById('editorDeckDesc').value || '';
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
      deck.title = document.getElementById('editorDeckTitle').value || '無題のデッキ';
      deck.description = document.getElementById('editorDeckDesc').value || '';
      try {
        await api.updateDeck(deck.id, deck);
        clearDirty();
      } catch {
        // save failed, but still navigate
      }
      if (deck) router.navigate(`/deck/${deck.id}`);
    });

  }

  // --- Monaco Editor Init ---

  function initMonaco() {
    if (monacoEditor) return;
    const container = document.getElementById('editorFileCode');
    monacoEditor = monaco.editor.create(container, {
      value: '',
      language: 'python',
      theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'vs' : 'vs-dark',
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

    monacoEditor.onDidChangeModelContent(debounce(() => {
      saveCurrentFile();
      updateCodePreview();
      markDirty();
    }, 300));

    const lineTargetTypes = [
      monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN,
      monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS,
    ];

    let draggingRange = false;
    let dragStartLine = -1;

    const setRangeInputs = (lineA, lineB) => {
      const start = Math.min(lineA, lineB);
      const end = Math.max(lineA, lineB);
      document.getElementById('editorLineStart').value = start;
      document.getElementById('editorLineEnd').value = end;
    };

    const finishRangeDrag = () => {
      if (!draggingRange) return;
      draggingRange = false;
      document.body.classList.remove('resizing-v');
      updateCodePreview();
      markDirty();
    };

    monacoEditor.onMouseDown((e) => {
      if (!lineTargetTypes.includes(e.target.type)) return;

      const line = e.target.position?.lineNumber;
      if (!line || !deck) return;

      const activeFile = deck.files[fileIndex];
      const fileRef = document.getElementById('editorFileRef').value;
      if (!activeFile || activeFile.name !== fileRef) return;

      // Cmd/Ctrl + gutter click: toggle highlight line
      if (e.event.ctrlKey || e.event.metaKey) {
        e.event.preventDefault();
        const input = document.getElementById('editorHighlight');
        const values = parseHighlightLinesInput(input.value);
        const idx = values.indexOf(line);
        if (idx >= 0) {
          values.splice(idx, 1);
        } else {
          values.push(line);
        }
        values.sort((a, b) => a - b);

        input.value = values.join(', ');
        syncMonacoWithFormState({ saveFile: false, reveal: false });
        markDirty();
        return;
      }

      // Gutter drag: update visible line range
      e.event.preventDefault();
      draggingRange = true;
      dragStartLine = line;
      document.body.classList.add('resizing-v');
      setRangeInputs(line, line);
      syncMonacoWithFormState({ saveFile: false, reveal: false });
    });

    monacoEditor.onMouseMove((e) => {
      if (!draggingRange) return;
      const line = e.target.position?.lineNumber;
      if (!line) return;
      setRangeInputs(dragStartLine, line);
      syncMonacoWithFormState({ saveFile: false, reveal: false });
    });

    window.addEventListener('mouseup', finishRangeDrag);

    const resizeObserver = new ResizeObserver(() => monacoEditor?.layout());
    resizeObserver.observe(container);
  }

  // --- Public API ---

  // Setup once
  setupEventListeners();

  async function show(deckId) {
    try {
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
      slideIndex = 0;
      fileIndex = 0;
      document.getElementById('editorDeckTitle').value = deck.title || '';
      document.getElementById('editorDeckDesc').value = deck.description || '';

      initMonaco();
      renderFileTabs();
      loadFile(0);
      renderSlideList();
      loadSlide(0);
    } catch {
      showToast('デッキの読み込みに失敗しました');
      router.navigate('/');
    }
  }

  return {
    show,
    get monacoEditor() { return monacoEditor; },
    setMonacoTheme(isDark) {
      if (monacoEditor) monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');
    },
  };
}
