/**
 * Editor View
 * Deck editor with Monaco Editor, file management, and slide editing
 */

import * as api from '../core/api.js';
import * as monaco from 'monaco-editor';
import hljs from 'highlight.js';
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

  function updateMonacoDecorations() {
    if (!monacoEditor || !deck) return;
    const slide = deck.slides[slideIndex];
    const file = deck.files[fileIndex];
    if (!slide || !file || slide.fileRef !== file.name) {
      monacoDecorations = monacoEditor.deltaDecorations(monacoDecorations, []);
      return;
    }
    const hls = slide.highlightLines || [];
    const newDecorations = hls.map(line => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: 'monaco-hl-line',
        glyphMarginClassName: 'monaco-hl-glyph',
      },
    }));
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

    document.querySelectorAll('.editor-slide-item').forEach((item, i) => {
      item.classList.toggle('active', i === index);
    });

    updateCodePreview();
    updateMarkdownPreview();
    updateMonacoDecorations();
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

    const hlText = document.getElementById('editorHighlight').value;
    slide.highlightLines = hlText
      ? hlText.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
      : [];
  }

  // --- Live Previews ---

  function updateCodePreview() {
    saveCurrentFile();

    const fileRef = document.getElementById('editorFileRef').value;
    const lineStart = parseInt(document.getElementById('editorLineStart').value) || 1;
    const lineEnd = parseInt(document.getElementById('editorLineEnd').value) || lineStart;
    const hlText = document.getElementById('editorHighlight').value;
    const highlightLines = hlText
      ? hlText.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
      : [];

    const file = deck.files?.find(f => f.name === fileRef);
    if (!file || !file.code) {
      document.getElementById('editorCodePreview').innerHTML = '<pre><code class="hljs"></code></pre>';
      document.getElementById('editorCodePreviewLabel').textContent = 'プレビュー';
      return;
    }

    document.getElementById('editorCodePreviewLabel').textContent = `${fileRef} : L${lineStart}–${lineEnd}`;

    let highlighted;
    try {
      highlighted = hljs.highlight(file.code, { language: file.language || 'python' }).value;
    } catch {
      highlighted = hljs.highlightAuto(file.code).value;
    }

    const allLines = highlighted.split('\n');
    if (allLines.length > 0 && allLines[allLines.length - 1] === '') allLines.pop();

    const highlightSet = new Set(highlightLines);
    const html = allLines.map((line, i) => {
      const absLine = i + 1;
      const inRange = absLine >= lineStart && absLine <= lineEnd;
      const isHL = highlightSet.has(absLine);
      const classes = ['code-line'];
      if (inRange) classes.push('in-range');
      if (isHL) classes.push('line-highlight');
      if (!inRange) classes.push('out-of-range');
      return `<div class="${classes.join(' ')}" data-abs-line="${absLine}">` +
        `<span class="line-number line-number-interactive" data-abs-line="${absLine}">${absLine}</span>` +
        `<span class="line-content">${line || ' '}</span>` +
        `</div>`;
    }).join('');

    const previewEl = document.getElementById('editorCodePreview');
    previewEl.innerHTML = `<pre><code class="hljs">${html}</code></pre>`;

    const firstInRange = previewEl.querySelector('.code-line.in-range');
    if (firstInRange) {
      firstInRange.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function updateMarkdownPreview() {
    const md = document.getElementById('editorMarkdown').value;
    mdPreviewPane.render(md);
  }

  // --- Interactive line range selection ---

  function setupCodePreviewInteraction() {
    const preview = document.getElementById('editorCodePreview');
    let isDragging = false;
    let dragStartLine = -1;

    function getLineFromEvent(e) {
      const lineEl = e.target.closest('[data-abs-line]');
      return lineEl ? parseInt(lineEl.dataset.absLine) : -1;
    }

    function updateVisualDragSelection(startLine, endLine) {
      const minL = Math.min(startLine, endLine);
      const maxL = Math.max(startLine, endLine);
      preview.querySelectorAll('.code-line').forEach(el => {
        const line = parseInt(el.dataset.absLine);
        el.classList.toggle('drag-selecting', line >= minL && line <= maxL);
      });
    }

    preview.addEventListener('mousedown', (e) => {
      const line = getLineFromEvent(e);
      if (line === -1) return;

      // Ctrl/Cmd + click for highlight toggle
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const hlInput = document.getElementById('editorHighlight');
        const current = hlInput.value
          ? hlInput.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
          : [];
        const idx = current.indexOf(line);
        if (idx >= 0) {
          current.splice(idx, 1);
        } else {
          current.push(line);
          current.sort((a, b) => a - b);
        }
        hlInput.value = current.join(', ');
        updateCodePreview();
        return;
      }

      e.preventDefault();
      isDragging = true;
      dragStartLine = line;
      updateVisualDragSelection(line, line);
    });

    preview.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const line = getLineFromEvent(e);
      if (line === -1) return;
      updateVisualDragSelection(dragStartLine, line);
    });

    document.addEventListener('mouseup', (e) => {
      if (!isDragging) return;
      isDragging = false;
      const line = getLineFromEvent(e);
      const endLine = line === -1 ? dragStartLine : line;

      const minL = Math.min(dragStartLine, endLine);
      const maxL = Math.max(dragStartLine, endLine);

      document.getElementById('editorLineStart').value = minL;
      document.getElementById('editorLineEnd').value = maxL;

      preview.querySelectorAll('.drag-selecting').forEach(el => el.classList.remove('drag-selecting'));
      updateCodePreview();
      dragStartLine = -1;
    });
  }

  // --- Event Listeners ---

  function setupEventListeners() {
    const debouncedCodePreview = debounce(updateCodePreview, 300);
    const debouncedMarkdownPreview = debounce(updateMarkdownPreview, 300);

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
    document.getElementById('editorFileRef').addEventListener('change', () => { updateCodePreview(); markDirty(); });
    document.getElementById('editorLineStart').addEventListener('input', () => { debouncedCodePreview(); markDirty(); });
    document.getElementById('editorLineEnd').addEventListener('input', () => { debouncedCodePreview(); markDirty(); });
    document.getElementById('editorHighlight').addEventListener('input', () => { debouncedCodePreview(); markDirty(); });
    document.getElementById('editorMarkdown').addEventListener('input', () => { debouncedMarkdownPreview(); markDirty(); });
    document.getElementById('editorDeckTitle').addEventListener('input', () => markDirty());
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
      try {
        await api.updateDeck(deck.id, deck);
        clearDirty();
      } catch {
        // save failed, but still navigate
      }
      if (deck) router.navigate(`/deck/${deck.id}`);
    });

    setupCodePreviewInteraction();
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

    const resizeObserver = new ResizeObserver(() => monacoEditor?.layout());
    resizeObserver.observe(container);
  }

  // --- Public API ---

  // Setup once
  setupEventListeners();

  async function show(deckId) {
    try {
      deck = await api.getDeck(deckId);
      if (!deck.files) deck.files = [];
      slideIndex = 0;
      fileIndex = 0;
      document.getElementById('editorDeckTitle').value = deck.title || '';

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
