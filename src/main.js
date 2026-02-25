/**
 * CodeStage — Main Application Entry Point
 * Wires together router, views, panes, slide management, layout, and UI interactions
 */

import './styles/index.css';
import '@xterm/xterm/css/xterm.css';
import { Router } from './core/router.js';
import { SlideManager } from './core/slides.js';
import { Resizer } from './core/resizer.js';
import { LayoutManager, LAYOUTS, LAYOUT_IDS } from './core/layout.js';
import { CodePane } from './panes/code.js';
import { ShellPane } from './panes/shell.js';
import { MarkdownPane } from './panes/markdown.js';
import * as api from './core/api.js';
import hljs from 'highlight.js';

// ============================
// Code Resolution Helper
// ============================

/**
 * Resolve a slide's code from the deck's files array
 * @param {Object} slide - Slide with fileRef + lineRange
 * @param {Object} deck - Deck with files array
 * @returns {{ code: string, language: string, highlightLines: number[] }}
 */
function resolveSlideCode(slide, deck) {
  const files = deck.files || [];
  const file = files.find(f => f.name === slide.fileRef);
  if (!file) return { code: '', language: 'python', highlightLines: [] };

  const lines = file.code.split('\n');
  const [start, end] = slide.lineRange || [1, lines.length];
  const slicedLines = lines.slice(start - 1, end);
  const code = slicedLines.join('\n');

  // Convert absolute highlight lines to relative (within the range)
  const highlightLines = (slide.highlightLines || [])
    .filter(l => l >= start && l <= end)
    .map(l => l - start + 1);

  return { code, language: file.language || 'python', highlightLines };
}

// ============================
// Theme (must be first for ShellPane)
// ============================

function getPreferredTheme() {
  const stored = localStorage.getItem('codestage-theme');
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function swapHighlightTheme(theme) {
  const hljsLink = document.getElementById('hljs-theme');
  if (!hljsLink) return;
  const darkTheme = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark-dimmed.min.css';
  const lightTheme = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
  hljsLink.href = theme === 'light' ? lightTheme : darkTheme;
}

let shellPane = null;

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('codestage-theme', theme);
  swapHighlightTheme(theme);
  if (shellPane) shellPane.setTheme(theme !== 'light');
}

applyTheme(getPreferredTheme());

document.getElementById('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  if (slideManager) slideManager.emit();
});

// ============================
// Toast Notification
// ============================

let toastTimeout;
function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2000);
}

// ============================
// Router + View Switching
// ============================

const router = new Router();
const views = {
  dashboard: document.getElementById('viewDashboard'),
  presentation: document.getElementById('viewPresentation'),
  editor: document.getElementById('viewEditor'),
};

// Presentation-only toolbar elements
const paneToggles = document.getElementById('paneToggles');
const layoutPicker = document.getElementById('layoutPicker');
const slideNav = document.getElementById('slideNav');
const progressBar = document.getElementById('progressBar');

function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    el.style.display = key === name ? '' : 'none';
  });

  // Show/hide presentation-specific toolbar items
  const isPresentation = name === 'presentation';
  paneToggles.style.display = isPresentation ? '' : 'none';
  layoutPicker.style.display = isPresentation ? '' : 'none';
  slideNav.style.display = isPresentation ? '' : 'none';
  progressBar.style.display = isPresentation ? '' : 'none';

  // Show/hide slide title
  document.getElementById('slideTitle').style.display = isPresentation ? '' : 'none';
}

// ============================
// Presentation Components (lazy-init)
// ============================

const slideManager = new SlideManager();
let presentationInitialized = false;
let contentEl, resizer, layoutManager;
let codePane, markdownPane;

const paneState = { code: true, shell: true, markdown: true };

function initPresentation() {
  if (presentationInitialized) return;
  presentationInitialized = true;

  contentEl = document.getElementById('content');
  resizer = new Resizer(contentEl);
  layoutManager = new LayoutManager(contentEl);

  const codeBody = document.getElementById('codeBody');
  const langBadge = document.getElementById('langBadge');
  const copyBtn = document.getElementById('copyBtn');
  const shellBody = document.getElementById('shellBody');
  const markdownBody = document.getElementById('markdownBody');

  codePane = new CodePane(codeBody, langBadge, copyBtn);
  shellPane = new ShellPane(shellBody, { isDark: getPreferredTheme() !== 'light' });
  markdownPane = new MarkdownPane(markdownBody);

  // Slide change handler
  slideManager.onChange(({ slide, position, total, hasPrev, hasNext }) => {
    if (!slide) return;
    document.getElementById('slideTitle').textContent = slide.title || '';
    document.getElementById('slideCounter').textContent = `${position} / ${total}`;
    document.getElementById('prevBtn').disabled = !hasPrev;
    document.getElementById('nextBtn').disabled = !hasNext;

    const progress = total > 1 ? ((position - 1) / (total - 1)) * 100 : 100;
    document.getElementById('progressFill').style.width = `${progress}%`;

    const resolved = resolveSlideCode(slide, presentationDeck);
    codePane.render(resolved.code, resolved.language, resolved.highlightLines);
    shellPane.render(slide.shell);
    markdownPane.render(slide.markdown);

    document.querySelectorAll('.slide-thumb').forEach((thumb, i) => {
      thumb.classList.toggle('active', i === position - 1);
    });
    const activeThumb = document.getElementById('slideBar').querySelector('.slide-thumb.active');
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });

  // Navigation buttons
  document.getElementById('prevBtn').addEventListener('click', () => slideManager.prev());
  document.getElementById('nextBtn').addEventListener('click', () => slideManager.next());

  // Pane toggle buttons
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pane = btn.dataset.pane;
      const visibleCount = Object.values(paneState).filter(Boolean).length;
      if (visibleCount <= 1 && paneState[pane]) {
        showToast('少なくとも1つのペインを表示する必要があります');
        return;
      }
      paneState[pane] = !paneState[pane];
      updatePaneVisibility();
    });
  });

  // Layout picker
  const layoutPickerBtn = document.getElementById('layoutPickerBtn');
  const layoutDropdown = document.getElementById('layoutDropdown');

  layoutPickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    layoutDropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.layout-picker')) {
      layoutDropdown.classList.remove('open');
    }
  });

  document.querySelectorAll('.layout-option').forEach(btn => {
    btn.addEventListener('click', () => {
      layoutManager.setLayout(btn.dataset.layout);
      rebuildLayout();
      document.querySelectorAll('.layout-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      layoutDropdown.classList.remove('open');
    });
  });

  // Drag & drop pane swapping
  let dragSourcePane = null;
  document.querySelectorAll('.pane-header[draggable="true"]').forEach(header => {
    header.addEventListener('dragstart', (e) => {
      dragSourcePane = header.dataset.pane;
      header.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragSourcePane);
      const ghost = header.cloneNode(true);
      ghost.style.opacity = '0.7';
      ghost.style.position = 'absolute';
      ghost.style.top = '-1000px';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0);
      setTimeout(() => ghost.remove(), 0);
    });
    header.addEventListener('dragend', () => {
      header.classList.remove('dragging');
      dragSourcePane = null;
      document.querySelectorAll('.pane').forEach(p => p.classList.remove('drop-target'));
    });
  });

  document.querySelectorAll('.pane[data-pane]').forEach(paneEl => {
    paneEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (paneEl.dataset.pane !== dragSourcePane) paneEl.classList.add('drop-target');
    });
    paneEl.addEventListener('dragleave', (e) => {
      if (!paneEl.contains(e.relatedTarget)) paneEl.classList.remove('drop-target');
    });
    paneEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const sourcePane = e.dataTransfer.getData('text/plain');
      const targetPane = paneEl.dataset.pane;
      if (sourcePane && targetPane && sourcePane !== targetPane) {
        layoutManager.swapPanesByName(sourcePane, targetPane);
        rebuildLayout();
      }
      document.querySelectorAll('.pane').forEach(p => p.classList.remove('drop-target'));
    });
  });

  // Init layout
  syncLayoutPicker();
  rebuildLayout();
  updatePaneVisibility();
}

function rebuildLayout() {
  layoutManager.apply(paneState);
  resizer.buildSplitters(layoutManager.layout, layoutManager.paneOrder, paneState);
  updateSplitterVisibility();
  if (shellPane) shellPane.fit();
}

function updatePaneVisibility() {
  document.getElementById('paneCode').classList.toggle('hidden', !paneState.code);
  document.getElementById('paneShell').classList.toggle('hidden', !paneState.shell);
  document.getElementById('paneMarkdown').classList.toggle('hidden', !paneState.markdown);
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.classList.toggle('active', paneState[btn.dataset.pane]);
  });
  rebuildLayout();
}

function updateSplitterVisibility() {
  const visiblePanes = layoutManager.paneOrder.filter(p => paneState[p]);
  resizer.splitters.forEach(({ el, def }) => {
    let shouldShow = true;
    def.between.forEach(slot => {
      if (typeof slot === 'number') {
        const paneName = layoutManager.paneOrder[slot];
        if (!paneState[paneName]) shouldShow = false;
      }
    });
    el.style.display = (!shouldShow || visiblePanes.length < 2) ? 'none' : '';
  });
}

function syncLayoutPicker() {
  document.querySelectorAll('.layout-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.layout === layoutManager.currentLayoutId);
  });
}

function buildSlideBar(slides) {
  const slideBar = document.getElementById('slideBar');
  slideBar.innerHTML = '';
  slides.forEach((slide, i) => {
    const thumb = document.createElement('button');
    thumb.className = 'slide-thumb';
    thumb.textContent = i + 1;
    thumb.title = slide.title || `Slide ${i + 1}`;
    thumb.addEventListener('click', () => slideManager.goTo(i));
    slideBar.appendChild(thumb);
  });
}

// ============================
// Dashboard View
// ============================

async function showDashboard() {
  showView('dashboard');
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

  // Attach event listeners
  grid.querySelectorAll('.deck-open').forEach(btn => {
    btn.addEventListener('click', () => router.navigate(`/deck/${btn.dataset.id}`));
  });
  grid.querySelectorAll('.deck-edit').forEach(btn => {
    btn.addEventListener('click', () => router.navigate(`/deck/${btn.dataset.id}/edit`));
  });
  grid.querySelectorAll('.deck-export').forEach(btn => {
    btn.addEventListener('click', () => exportDeck(btn.dataset.id));
  });
  grid.querySelectorAll('.deck-delete').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteDeck(btn.dataset.id));
  });
}

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
  } catch (err) {
    showToast('エクスポートに失敗しました');
  }
}

async function handleDeleteDeck(id) {
  if (!confirm('このデッキを削除しますか？')) return;
  try {
    await api.deleteDeck(id);
    showToast('削除しました');
    showDashboard();
  } catch (err) {
    showToast('削除に失敗しました');
  }
}

// New deck button
document.getElementById('newDeckBtn').addEventListener('click', async () => {
  try {
    const deck = await api.createDeck({ title: '新しいデッキ' });
    router.navigate(`/deck/${deck.id}/edit`);
  } catch (err) {
    showToast('デッキの作成に失敗しました');
  }
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
    await api.createDeck({
      title: data.title || file.name.replace('.json', ''),
      description: data.description || '',
      slides: data.slides || [],
    });
    showToast('インポートしました');
    showDashboard();
  } catch (err) {
    showToast('インポートに失敗しました');
  }
  e.target.value = '';
});

// ============================
// Presentation View
// ============================

let presentationDeck = null;

async function showPresentation(deckId) {
  initPresentation();
  showView('presentation');

  try {
    const deck = await api.getDeck(deckId);
    presentationDeck = deck;
    buildSlideBar(deck.slides);
    slideManager.load(deck.slides);
  } catch (err) {
    showToast('デッキの読み込みに失敗しました');
    router.navigate('/');
  }
}

// ============================
// Editor View
// ============================

let editorDeck = null;
let editorSlideIndex = 0;
let editorFileIndex = 0;

async function showEditor(deckId) {
  showView('editor');

  try {
    editorDeck = await api.getDeck(deckId);
    // Ensure files array exists (backward compat)
    if (!editorDeck.files) editorDeck.files = [];
    editorSlideIndex = 0;
    editorFileIndex = 0;
    document.getElementById('editorDeckTitle').value = editorDeck.title || '';
    renderEditorFileTabs();
    loadFileIntoEditor(0);
    renderEditorSlideList();
    loadSlideIntoEditor(0);
  } catch (err) {
    showToast('デッキの読み込みに失敗しました');
    router.navigate('/');
  }
}

// --- File Tabs ---

function renderEditorFileTabs() {
  const tabs = document.getElementById('editorFileTabs');
  tabs.innerHTML = editorDeck.files.map((file, i) => `
    <button class="editor-file-tab ${i === editorFileIndex ? 'active' : ''}" data-index="${i}">
      ${escapeHtml(file.name || '無名')}
    </button>
  `).join('');

  tabs.querySelectorAll('.editor-file-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      saveCurrentFileFromEditor();
      const idx = parseInt(tab.dataset.index);
      loadFileIntoEditor(idx);
    });
  });

  // Update fileRef dropdown
  updateFileRefOptions();
}

function updateFileRefOptions() {
  const select = document.getElementById('editorFileRef');
  const currentVal = select.value;
  select.innerHTML = editorDeck.files.map(f =>
    `<option value="${escapeHtml(f.name)}">${escapeHtml(f.name)}</option>`
  ).join('');
  // Restore selection if it still exists
  if (currentVal && editorDeck.files.some(f => f.name === currentVal)) {
    select.value = currentVal;
  }
}

function loadFileIntoEditor(index) {
  editorFileIndex = index;
  const file = editorDeck.files[index];
  if (!file) {
    document.getElementById('editorFileName').value = '';
    document.getElementById('editorFileLang').value = '';
    document.getElementById('editorFileCode').value = '';
    return;
  }

  document.getElementById('editorFileName').value = file.name || '';
  document.getElementById('editorFileLang').value = file.language || '';
  document.getElementById('editorFileCode').value = file.code || '';

  // Update active tab
  document.querySelectorAll('.editor-file-tab').forEach((tab, i) => {
    tab.classList.toggle('active', i === index);
  });
}

function saveCurrentFileFromEditor() {
  if (!editorDeck || !editorDeck.files[editorFileIndex]) return;
  const file = editorDeck.files[editorFileIndex];
  const oldName = file.name;
  file.name = document.getElementById('editorFileName').value || '無名';
  file.language = document.getElementById('editorFileLang').value || 'python';
  file.code = document.getElementById('editorFileCode').value;

  // If name changed, update fileRef in all slides
  if (oldName !== file.name) {
    editorDeck.slides.forEach(slide => {
      if (slide.fileRef === oldName) slide.fileRef = file.name;
    });
    updateFileRefOptions();
  }
}

// Add file
document.getElementById('addFileBtn').addEventListener('click', () => {
  saveCurrentFileFromEditor();
  const newName = `file${editorDeck.files.length + 1}.py`;
  editorDeck.files.push({ name: newName, language: 'python', code: '' });
  editorFileIndex = editorDeck.files.length - 1;
  renderEditorFileTabs();
  loadFileIntoEditor(editorFileIndex);
});

// Delete file
document.getElementById('deleteFileBtn').addEventListener('click', () => {
  if (editorDeck.files.length <= 1) {
    showToast('最後のファイルは削除できません');
    return;
  }
  const deletedName = editorDeck.files[editorFileIndex].name;
  editorDeck.files.splice(editorFileIndex, 1);
  if (editorFileIndex >= editorDeck.files.length) {
    editorFileIndex = editorDeck.files.length - 1;
  }
  // Clear fileRef from slides referencing the deleted file
  editorDeck.slides.forEach(slide => {
    if (slide.fileRef === deletedName) slide.fileRef = '';
  });
  renderEditorFileTabs();
  loadFileIntoEditor(editorFileIndex);
  updateCodePreview();
});

// Auto-save file name/lang changes
document.getElementById('editorFileName').addEventListener('change', () => {
  saveCurrentFileFromEditor();
  renderEditorFileTabs();
});
document.getElementById('editorFileLang').addEventListener('change', () => {
  saveCurrentFileFromEditor();
});

// --- Slide List ---

function renderEditorSlideList() {
  const list = document.getElementById('editorSlideList');
  list.innerHTML = editorDeck.slides.map((slide, i) => `
    <li class="editor-slide-item ${i === editorSlideIndex ? 'active' : ''}" data-index="${i}">
      <span class="editor-slide-num">${i + 1}</span>
      <span class="editor-slide-name">${escapeHtml(slide.title || '無題')}</span>
      <button class="btn-icon editor-slide-delete" data-index="${i}" title="削除">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </li>
  `).join('');

  list.querySelectorAll('.editor-slide-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.editor-slide-delete')) return;
      saveCurrentSlideFromEditor();
      const idx = parseInt(item.dataset.index);
      loadSlideIntoEditor(idx);
    });
  });

  list.querySelectorAll('.editor-slide-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      if (editorDeck.slides.length <= 1) {
        showToast('最後のスライドは削除できません');
        return;
      }
      editorDeck.slides.splice(idx, 1);
      if (editorSlideIndex >= editorDeck.slides.length) {
        editorSlideIndex = editorDeck.slides.length - 1;
      }
      renderEditorSlideList();
      loadSlideIntoEditor(editorSlideIndex);
    });
  });
}

// --- Slide Editor ---

function loadSlideIntoEditor(index) {
  editorSlideIndex = index;
  const slide = editorDeck.slides[index];
  if (!slide) return;

  document.getElementById('editorSlideTitle').value = slide.title || '';
  document.getElementById('editorFileRef').value = slide.fileRef || '';
  const [lineStart, lineEnd] = slide.lineRange || [1, 1];
  document.getElementById('editorLineStart').value = lineStart;
  document.getElementById('editorLineEnd').value = lineEnd;
  document.getElementById('editorHighlight').value = (slide.highlightLines || []).join(', ');
  document.getElementById('editorMarkdown').value = slide.markdown || '';

  // Update active state in list
  document.querySelectorAll('.editor-slide-item').forEach((item, i) => {
    item.classList.toggle('active', i === index);
  });

  // Trigger live previews
  updateCodePreview();
  updateMarkdownPreview();
}

function saveCurrentSlideFromEditor() {
  if (!editorDeck || !editorDeck.slides[editorSlideIndex]) return;
  const slide = editorDeck.slides[editorSlideIndex];
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

// ============================
// Live Preview in Editor
// ============================

const editorMarkdownPreviewEl = document.getElementById('editorMarkdownPreview');
const editorMdPane = new MarkdownPane(editorMarkdownPreviewEl);

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function updateCodePreview() {
  // Save current file code first (in case the user edited the source)
  saveCurrentFileFromEditor();

  // Build a temporary slide object from the current form values
  const fileRef = document.getElementById('editorFileRef').value;
  const lineStart = parseInt(document.getElementById('editorLineStart').value) || 1;
  const lineEnd = parseInt(document.getElementById('editorLineEnd').value) || lineStart;
  const hlText = document.getElementById('editorHighlight').value;
  const highlightLines = hlText
    ? hlText.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
    : [];

  const tempSlide = { fileRef, lineRange: [lineStart, lineEnd], highlightLines };
  const resolved = resolveSlideCode(tempSlide, editorDeck);

  const previewEl = document.getElementById('editorCodePreview');
  const label = document.getElementById('editorCodePreviewLabel');

  if (!resolved.code) {
    previewEl.innerHTML = '<pre><code class="hljs"></code></pre>';
    label.textContent = 'プレビュー';
    return;
  }

  label.textContent = `${fileRef} : L${lineStart}–${lineEnd}`;

  let highlighted;
  try {
    highlighted = hljs.highlight(resolved.code, { language: resolved.language }).value;
  } catch {
    highlighted = hljs.highlightAuto(resolved.code).value;
  }

  const lines = highlighted.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const highlightSet = new Set(resolved.highlightLines);
  const html = lines.map((line, i) => {
    const lineNum = i + 1;
    const absLine = lineStart + i; // Show absolute line numbers
    const isHL = highlightSet.has(lineNum);
    return `<div class="code-line${isHL ? ' line-highlight' : ''}">` +
      `<span class="line-number">${absLine}</span>` +
      `<span class="line-content">${line || ' '}</span>` +
      `</div>`;
  }).join('');

  previewEl.innerHTML = `<pre><code class="hljs">${html}</code></pre>`;
}

function updateMarkdownPreview() {
  const md = document.getElementById('editorMarkdown').value;
  editorMdPane.render(md);
}

const debouncedCodePreview = debounce(updateCodePreview, 300);
const debouncedMarkdownPreview = debounce(updateMarkdownPreview, 300);

document.getElementById('editorFileCode').addEventListener('input', debouncedCodePreview);
document.getElementById('editorFileRef').addEventListener('change', () => updateCodePreview());
document.getElementById('editorLineStart').addEventListener('input', debouncedCodePreview);
document.getElementById('editorLineEnd').addEventListener('input', debouncedCodePreview);
document.getElementById('editorHighlight').addEventListener('input', debouncedCodePreview);
document.getElementById('editorMarkdown').addEventListener('input', debouncedMarkdownPreview);

// Add slide
document.getElementById('addSlideBtn').addEventListener('click', () => {
  saveCurrentSlideFromEditor();
  const firstFile = editorDeck.files[0];
  editorDeck.slides.push({
    title: `スライド ${editorDeck.slides.length + 1}`,
    fileRef: firstFile ? firstFile.name : '',
    lineRange: [1, 1],
    highlightLines: [],
    markdown: '',
  });
  editorSlideIndex = editorDeck.slides.length - 1;
  renderEditorSlideList();
  loadSlideIntoEditor(editorSlideIndex);
});

// Save deck
document.getElementById('editorSaveBtn').addEventListener('click', async () => {
  saveCurrentSlideFromEditor();
  saveCurrentFileFromEditor();
  editorDeck.title = document.getElementById('editorDeckTitle').value || '無題のデッキ';

  try {
    await api.updateDeck(editorDeck.id, editorDeck);
    showToast('保存しました');
    renderEditorSlideList();
  } catch (err) {
    showToast('保存に失敗しました');
  }
});

// Preview button
document.getElementById('editorPreviewBtn').addEventListener('click', () => {
  saveCurrentSlideFromEditor();
  saveCurrentFileFromEditor();
  if (editorDeck) {
    router.navigate(`/deck/${editorDeck.id}`);
  }
});

// ============================
// Keyboard Shortcuts
// ============================

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.target.closest('.xterm')) return;

  // Only handle navigation when in presentation view
  if (views.presentation.style.display === 'none') return;

  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      e.preventDefault();
      slideManager.prev();
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      e.preventDefault();
      slideManager.next();
      break;
    case '1':
      if (!e.ctrlKey && !e.metaKey) {
        paneState.code = !paneState.code;
        if (!Object.values(paneState).some(Boolean)) paneState.code = true;
        updatePaneVisibility();
      }
      break;
    case '2':
      if (!e.ctrlKey && !e.metaKey) {
        paneState.shell = !paneState.shell;
        if (!Object.values(paneState).some(Boolean)) paneState.shell = true;
        updatePaneVisibility();
      }
      break;
    case '3':
      if (!e.ctrlKey && !e.metaKey) {
        paneState.markdown = !paneState.markdown;
        if (!Object.values(paneState).some(Boolean)) paneState.markdown = true;
        updatePaneVisibility();
      }
      break;
  }
});

// ============================
// Utilities
// ============================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

// ============================
// Routes
// ============================

router
  .on('/', () => showDashboard())
  .on('/deck/:id', ({ id }) => showPresentation(id))
  .on('/deck/:id/edit', ({ id }) => showEditor(id))
  .start();

// Remove Vite default styles
const defaultStyle = document.querySelector('link[href="/style.css"]');
if (defaultStyle) defaultStyle.remove();
