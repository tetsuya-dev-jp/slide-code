/**
 * CodeStage — Main Application Entry Point
 * Wires together all panes, slide management, and UI interactions
 */

import './styles/index.css';
import { SlideManager } from './core/slides.js';
import { Resizer } from './core/resizer.js';
import { CodePane } from './panes/code.js';
import { ShellPane } from './panes/shell.js';
import { MarkdownPane } from './panes/markdown.js';
import { sampleSlides } from './data/sample-slides.js';

// ============================
// Initialize components
// ============================

const slideManager = new SlideManager();
const resizer = new Resizer();

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
  middleArea: document.getElementById('middleArea'),
  splitterV1: document.getElementById('splitterV1'),
  splitterV2: document.getElementById('splitterV2'),
  slideBar: document.getElementById('slideBar'),
  codeBody: document.getElementById('codeBody'),
  langBadge: document.getElementById('langBadge'),
  copyBtn: document.getElementById('copyBtn'),
  shellBody: document.getElementById('shellBody'),
  markdownBody: document.getElementById('markdownBody'),
};

// Pane instances
const codePane = new CodePane(elements.codeBody, elements.langBadge, elements.copyBtn);
const shellPane = new ShellPane(elements.shellBody);
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
  // Code pane
  elements.paneCode.classList.toggle('hidden', !paneState.code);

  // Shell (middle area)
  elements.middleArea.classList.toggle('hidden', !paneState.shell);

  // Markdown pane
  elements.paneMarkdown.classList.toggle('hidden', !paneState.markdown);

  // Splitter visibility
  // V1 shows if both code AND (shell or markdown) are visible
  const showV1 = paneState.code && (paneState.shell || paneState.markdown);
  elements.splitterV1.classList.toggle('hidden', !showV1);

  // V2 shows if both shell AND markdown are visible
  const showV2 = paneState.shell && paneState.markdown;
  elements.splitterV2.classList.toggle('hidden', !showV2);

  // Update toggle button states
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    const pane = btn.dataset.pane;
    btn.classList.toggle('active', paneState[pane]);
  });
}

// Toggle button click handlers
document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const pane = btn.dataset.pane;
    // Don't allow hiding all panes
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
// Splitters (Resize)
// ============================

resizer.addVertical(elements.splitterV1, elements.paneCode, elements.middleArea, { minSize: 200 });
resizer.addVertical(elements.splitterV2, elements.middleArea, elements.paneMarkdown, { minSize: 200 });

// ============================
// Slide Navigation
// ============================

elements.prevBtn.addEventListener('click', () => slideManager.prev());
elements.nextBtn.addEventListener('click', () => slideManager.next());

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ignore if typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

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

  // Update toolbar
  elements.slideTitle.textContent = slide.title || '';
  elements.slideCounter.textContent = `${position} / ${total}`;
  elements.prevBtn.disabled = !hasPrev;
  elements.nextBtn.disabled = !hasNext;

  // Update progress bar
  const progress = total > 1 ? ((position - 1) / (total - 1)) * 100 : 100;
  elements.progressFill.style.width = `${progress}%`;

  // Render panes
  codePane.render(slide.code || '', slide.language || 'python', slide.highlightLines || []);
  shellPane.render(slide.shell);
  markdownPane.render(slide.markdown);

  // Update slide bar active state
  document.querySelectorAll('.slide-thumb').forEach((thumb, i) => {
    thumb.classList.toggle('active', i === position - 1);
  });

  // Scroll active thumb into view
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

function getPreferredTheme() {
  const stored = localStorage.getItem('codestage-theme');
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('codestage-theme', theme);

  // Swap highlight.js stylesheet
  swapHighlightTheme(theme);
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
  // Re-render current slide for mermaid theme update
  slideManager.emit();
});

// ============================
// Initialize
// ============================

// Apply saved/preferred theme
applyTheme(getPreferredTheme());

buildSlideBar(sampleSlides);
slideManager.load(sampleSlides);
updatePaneVisibility();

// Remove Vite default styles
const defaultStyle = document.querySelector('link[href="/style.css"]');
if (defaultStyle) defaultStyle.remove();
