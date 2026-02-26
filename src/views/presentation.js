/**
 * Presentation View
 * Slide presentation with code, shell, and markdown panes
 */

import * as api from '../core/api.js';
import { SlideManager } from '../core/slides.js';
import { Resizer } from '../core/resizer.js';
import { LayoutManager } from '../core/layout.js';
import { CodePane } from '../panes/code.js';
import { ShellPane } from '../panes/shell.js';
import { MarkdownPane } from '../panes/markdown.js';
import { resolveSlideCode } from '../core/resolve-code.js';
import { showToast } from '../utils/helpers.js';
import { theme } from '../core/theme.js';

export function initPresentation(router) {
  const slideManager = new SlideManager();
  const paneState = { code: true, shell: true, markdown: true };

  let initialized = false;
  let contentEl, resizer, layoutManager;
  let codePane, shellPane, markdownPane;
  let presentationDeck = null;

  function init() {
    if (initialized) return;
    initialized = true;

    contentEl = document.getElementById('content');
    resizer = new Resizer(contentEl);
    layoutManager = new LayoutManager(contentEl);

    codePane = new CodePane(
      document.getElementById('codeBody'),
      document.getElementById('langBadge'),
      document.getElementById('copyBtn'),
    );
    shellPane = new ShellPane(
      document.getElementById('shellBody'),
      { isDark: theme.isDark },
    );
    markdownPane = new MarkdownPane(document.getElementById('markdownBody'));

    setupSlideChangeHandler();
    setupNavigation();
    setupPaneToggles();
    setupLayoutPicker();
    setupPaneDragDrop();
    setupKeyboardShortcuts();

    syncLayoutPicker();
    rebuildLayout();
    updatePaneVisibility();
  }

  function setupSlideChangeHandler() {
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
  }

  function setupNavigation() {
    document.getElementById('prevBtn').addEventListener('click', () => slideManager.prev());
    document.getElementById('nextBtn').addEventListener('click', () => slideManager.next());
  }

  function setupPaneToggles() {
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
  }

  function setupLayoutPicker() {
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
  }

  function setupPaneDragDrop() {
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
  }

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.target.closest('.xterm')) return;
      if (document.getElementById('viewPresentation').style.display === 'none') return;

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
        case '2':
        case '3': {
          if (e.ctrlKey || e.metaKey) break;
          const paneNames = ['code', 'shell', 'markdown'];
          const pane = paneNames[parseInt(e.key) - 1];
          paneState[pane] = !paneState[pane];
          if (!Object.values(paneState).some(Boolean)) paneState[pane] = true;
          updatePaneVisibility();
          break;
        }
      }
    });
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

  async function show(deckId) {
    init();
    try {
      const deck = await api.getDeck(deckId);
      presentationDeck = deck;
      buildSlideBar(deck.slides);
      slideManager.load(deck.slides);
    } catch {
      showToast('デッキの読み込みに失敗しました');
      router.navigate('/');
    }
  }

  return {
    show,
    get shellPane() { return shellPane; },
    get slideManager() { return slideManager; },
  };
}
