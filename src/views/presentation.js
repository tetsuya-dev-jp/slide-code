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
import { getLastPresentationState, recordRecentDeck, setLastPresentationState } from '../core/preferences.js';
import { theme } from '../core/theme.js';
import {
  applyPaneToggle,
  createPanePreferences,
  getSlidePaneDefaults,
  resolvePaneVisibility,
} from './presentation-pane-state.js';

export function initPresentation(router) {
  const slideManager = new SlideManager();
  const paneState = { code: true, shell: true, markdown: true };
  let panePreferences = createPanePreferences();
  let slidePaneDefaults = { ...paneState };

  let initialized = false;
  let contentEl, resizer, layoutManager;
  let codePane, shellPane, markdownPane;
  let presentationDeck = null;
  let currentDeckId = null;
  let showRequestId = 0;

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
      { isDark: theme.isDark, deckId: currentDeckId || '' },
    );
    markdownPane = new MarkdownPane(document.getElementById('markdownBody'), {
      resolveAssetUrl: (assetPath) => {
        if (!currentDeckId) return `asset://${assetPath}`;
        return api.getDeckAssetUrl(currentDeckId, assetPath);
      },
    });

    setupSlideChangeHandler();
    setupNavigation();
    setupPaneToggles();
    setupLayoutPicker();
    setupPaneDragDrop();
    setupKeyboardShortcuts();
    setupViewportHandler();

    syncLayoutPicker();
    rebuildLayout();
    updatePaneVisibility();
  }

  function setupSlideChangeHandler() {
    slideManager.onChange(({ slide, index, position, total, hasPrev, hasNext }) => {
      if (!slide) return;
      document.getElementById('slideTitle').textContent = slide.title || '';
      document.getElementById('slideCounter').textContent = `${position} / ${total}`;
      document.getElementById('prevBtn').disabled = !hasPrev;
      document.getElementById('nextBtn').disabled = !hasNext;

      const progress = total > 1 ? ((position - 1) / (total - 1)) * 100 : 100;
      document.getElementById('progressFill').style.width = `${progress}%`;

      const resolved = resolveSlideCode(slide, presentationDeck);
      codePane.render(resolved.code, resolved.language, resolved.highlightLines);
      markdownPane.render(slide.markdown);
      syncPaneVisibilityForSlide(slide, resolved);
      if (currentDeckId) {
        setLastPresentationState({ deckId: currentDeckId, slideIndex: index });
      }
    });
  }

  function syncPaneVisibilityForSlide(slide, resolved) {
    slidePaneDefaults = getSlidePaneDefaults(slide, resolved);
    Object.assign(paneState, resolvePaneVisibility(panePreferences, slidePaneDefaults));

    updatePaneVisibility();
  }

  function setupNavigation() {
    document.getElementById('prevBtn').addEventListener('click', () => slideManager.prev());
    document.getElementById('nextBtn').addEventListener('click', () => slideManager.next());
    document.getElementById('editDeckBtn').addEventListener('click', () => {
      if (!currentDeckId) return;
      router.navigate(`/deck/${currentDeckId}/edit`);
    });
  }

  function setupPaneToggles() {
    document.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pane = btn.dataset.pane;
        const next = applyPaneToggle({
          pane,
          preferences: panePreferences,
          visibility: paneState,
          defaults: slidePaneDefaults,
        });
        if (!next.allowed) {
          showToast('少なくとも1つのペインを表示する必要があります');
          return;
        }

        panePreferences = next.preferences;
        Object.assign(paneState, next.visibility);
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
          const next = applyPaneToggle({
            pane,
            preferences: panePreferences,
            visibility: paneState,
            defaults: slidePaneDefaults,
          });
          if (!next.allowed) break;
          panePreferences = next.preferences;
          Object.assign(paneState, next.visibility);
          updatePaneVisibility();
          break;
        }
      }
    });
  }

  function setupViewportHandler() {
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const onViewportChange = () => rebuildLayout();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onViewportChange);
    } else {
      mediaQuery.addListener(onViewportChange);
    }
  }

  function rebuildLayout() {
    layoutManager.apply(paneState);
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      resizer.reset();
    } else {
      resizer.buildSplitters(layoutManager.layout, layoutManager.paneOrder, paneState);
    }
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

  function syncShellDeckSession(previousDeckId, nextDeckId) {
    if (!shellPane) return;

    if (previousDeckId === nextDeckId) {
      shellPane.reconnect();
      return;
    }

    shellPane.setDeckId(nextDeckId);
  }

  async function show(deckId) {
    const requestId = ++showRequestId;
    const previousDeckId = currentDeckId;
    currentDeckId = deckId;
    panePreferences = createPanePreferences();
    slidePaneDefaults = { code: true, shell: true, markdown: true };
    init();
    try {
      const deck = await api.getDeck(deckId);
      if (requestId !== showRequestId) return;
      presentationDeck = deck;
      recordRecentDeck({ id: deck.id, title: deck.title });
      syncShellDeckSession(previousDeckId, deckId);
      const restoredState = getLastPresentationState(deck.id);
      slideManager.load(deck.slides, restoredState?.slideIndex ?? 0);
    } catch {
      if (requestId !== showRequestId) return;
      currentDeckId = null;
      showToast('デッキの読み込みに失敗しました');
      router.navigate('/');
    }
  }

  return {
    show,
    applyTheme(isDark) {
      if (shellPane) shellPane.setTheme(isDark);
      if (slideManager.current()) slideManager.emit();
    },
    get shellPane() { return shellPane; },
    get slideManager() { return slideManager; },
  };
}
