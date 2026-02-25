/**
 * CodeStage — Main Application Entry Point
 * Wires together all panes, slide management, layout, and UI interactions
 */

import './styles/index.css';
import '@xterm/xterm/css/xterm.css';
import { SlideManager } from './core/slides.js';
import { Resizer } from './core/resizer.js';
import { LayoutManager, LAYOUTS, LAYOUT_IDS } from './core/layout.js';
import { CodePane } from './panes/code.js';
import { ShellPane } from './panes/shell.js';
import { MarkdownPane } from './panes/markdown.js';
import { sampleSlides } from './data/sample-slides.js';

// ============================
// Initialize components
// ============================

const slideManager = new SlideManager();
const contentEl = document.getElementById('content');
const resizer = new Resizer(contentEl);
const layoutManager = new LayoutManager(contentEl);

// DOM Elements
const elements = {
  slideTitle: document.getElementById('slideTitle'),
  slideCounter: document.getElementById('slideCounter'),
  progressFill: document.getElementById('progressFill'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  paneCode: document.getElementById('paneCode'),
  paneShell: document.getElementById('paneShell'),
  paneMarkdown: document.getElementById('paneMarkdown'),
  content: contentEl,
  slideBar: document.getElementById('slideBar'),
  codeBody: document.getElementById('codeBody'),
  langBadge: document.getElementById('langBadge'),
  copyBtn: document.getElementById('copyBtn'),
  shellBody: document.getElementById('shellBody'),
  markdownBody: document.getElementById('markdownBody'),
};

// Pane instances
const codePane = new CodePane(elements.codeBody, elements.langBadge, elements.copyBtn);
const shellPane = new ShellPane(elements.shellBody, {
  isDark: getPreferredTheme() !== 'light',
});
const markdownPane = new MarkdownPane(elements.markdownBody);

// ============================
// Pane Visibility
// ============================

const paneState = {
  code: true,
  shell: true,
  markdown: true,
};

function updatePaneVisibility() {
  // Update pane hidden class
  elements.paneCode.classList.toggle('hidden', !paneState.code);
  elements.paneShell.classList.toggle('hidden', !paneState.shell);
  elements.paneMarkdown.classList.toggle('hidden', !paneState.markdown);

  // Update toggle button states
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    const pane = btn.dataset.pane;
    btn.classList.toggle('active', paneState[pane]);
  });

  // Rebuild grid layout considering hidden panes
  rebuildLayout();
}

// Toggle button click handlers
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

// ============================
// Layout Management
// ============================

function rebuildLayout() {
  // Apply the CSS Grid layout
  layoutManager.apply(paneState);

  // Build grid splitters
  resizer.buildSplitters(layoutManager.layout, layoutManager.paneOrder, paneState);

  // Handle splitter visibility for hidden panes
  updateSplitterVisibility();

  // Re-fit the terminal after layout changes
  shellPane.fit();
}

function updateSplitterVisibility() {
  const visiblePanes = layoutManager.paneOrder.filter(p => paneState[p]);

  resizer.splitters.forEach(({ el, def }) => {
    // Determine if the splitter should be visible
    const between = def.between;
    let shouldShow = true;

    between.forEach(slot => {
      if (typeof slot === 'number') {
        const paneName = layoutManager.paneOrder[slot];
        if (!paneState[paneName]) shouldShow = false;
      }
    });

    // If only 1 pane is visible next to a splitter, hide it
    if (!shouldShow || visiblePanes.length < 2) {
      el.style.display = 'none';
    } else {
      el.style.display = '';
    }
  });
}

// ============================
// Layout Picker
// ============================

const layoutPickerBtn = document.getElementById('layoutPickerBtn');
const layoutDropdown = document.getElementById('layoutDropdown');

layoutPickerBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  layoutDropdown.classList.toggle('open');
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.layout-picker')) {
    layoutDropdown.classList.remove('open');
  }
});

// Layout option click handlers
document.querySelectorAll('.layout-option').forEach(btn => {
  btn.addEventListener('click', () => {
    const layoutId = btn.dataset.layout;
    layoutManager.setLayout(layoutId);
    rebuildLayout();

    // Update active state
    document.querySelectorAll('.layout-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    layoutDropdown.classList.remove('open');
  });
});

// Set initial active layout option
function syncLayoutPicker() {
  document.querySelectorAll('.layout-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.layout === layoutManager.currentLayoutId);
  });
}

// ============================
// Drag & Drop Pane Swapping
// ============================

let dragSourcePane = null;

document.querySelectorAll('.pane-header[draggable="true"]').forEach(header => {
  header.addEventListener('dragstart', (e) => {
    dragSourcePane = header.dataset.pane;
    header.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSourcePane);

    // Create minimal drag image
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
    // Remove all drop targets
    document.querySelectorAll('.pane').forEach(p => p.classList.remove('drop-target'));
  });
});

// Drop targets
document.querySelectorAll('.pane[data-pane]').forEach(paneEl => {
  paneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const targetPane = paneEl.dataset.pane;
    if (targetPane !== dragSourcePane) {
      paneEl.classList.add('drop-target');
    }
  });

  paneEl.addEventListener('dragleave', (e) => {
    // Only remove if we're actually leaving the pane (not entering a child)
    if (!paneEl.contains(e.relatedTarget)) {
      paneEl.classList.remove('drop-target');
    }
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

// ============================
// Slide Navigation
// ============================

elements.prevBtn.addEventListener('click', () => slideManager.prev());
elements.nextBtn.addEventListener('click', () => slideManager.next());

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  // Don't intercept keys when xterm terminal is focused
  if (e.target.closest('.xterm')) return;

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
// Slide Change Handler
// ============================

slideManager.onChange(({ slide, position, total, hasPrev, hasNext }) => {
  if (!slide) return;

  elements.slideTitle.textContent = slide.title || '';
  elements.slideCounter.textContent = `${position} / ${total}`;
  elements.prevBtn.disabled = !hasPrev;
  elements.nextBtn.disabled = !hasNext;

  const progress = total > 1 ? ((position - 1) / (total - 1)) * 100 : 100;
  elements.progressFill.style.width = `${progress}%`;

  codePane.render(slide.code || '', slide.language || 'python', slide.highlightLines || []);
  shellPane.render(slide.shell);
  markdownPane.render(slide.markdown);

  document.querySelectorAll('.slide-thumb').forEach((thumb, i) => {
    thumb.classList.toggle('active', i === position - 1);
  });

  const activeThumb = elements.slideBar.querySelector('.slide-thumb.active');
  if (activeThumb) {
    activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
});

// ============================
// Slide Thumbnail Bar
// ============================

function buildSlideBar(slides) {
  elements.slideBar.innerHTML = '';
  slides.forEach((slide, i) => {
    const thumb = document.createElement('button');
    thumb.className = 'slide-thumb';
    thumb.textContent = i + 1;
    thumb.title = slide.title || `Slide ${i + 1}`;
    thumb.addEventListener('click', () => slideManager.goTo(i));
    elements.slideBar.appendChild(thumb);
  });
}

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
// Theme Toggle
// ============================

const themeToggle = document.getElementById('themeToggle');

// Hoisted so it can be used during ShellPane construction
function getPreferredTheme() {
  const stored = localStorage.getItem('codestage-theme');
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('codestage-theme', theme);
  swapHighlightTheme(theme);
  shellPane.setTheme(theme !== 'light');
}

function swapHighlightTheme(theme) {
  const hljsLink = document.getElementById('hljs-theme');
  if (!hljsLink) return;

  const darkTheme = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark-dimmed.min.css';
  const lightTheme = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
  hljsLink.href = theme === 'light' ? lightTheme : darkTheme;
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  slideManager.emit();
});

// ============================
// Initialize
// ============================

// Apply saved/preferred theme
applyTheme(getPreferredTheme());

// Build layout
syncLayoutPicker();
rebuildLayout();

buildSlideBar(sampleSlides);
slideManager.load(sampleSlides);
updatePaneVisibility();

// Remove Vite default styles
const defaultStyle = document.querySelector('link[href="/style.css"]');
if (defaultStyle) defaultStyle.remove();
