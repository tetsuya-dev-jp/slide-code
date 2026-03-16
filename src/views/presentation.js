/**
 * Presentation View
 * Slide presentation with code, shell, and markdown panes
 */

import * as api from '../core/api.js';
import { SlideManager } from '../core/slides.js';
import { Resizer } from '../core/resizer.js';
import { LayoutManager } from '../core/layout.js';
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
  const paneLabels = { code: 'コード', shell: 'シェル', markdown: '解説' };
  const paneState = { code: true, shell: true, markdown: true };
  let panePreferences = createPanePreferences();
  let slidePaneDefaults = { ...paneState };

  let initialized = false;
  let initPromise = null;
  let paneRuntimePromise = null;
  let contentEl, resizer, layoutManager;
  let codePane, shellPane, markdownPane;
  let presentationDeck = null;
  let currentDeckId = null;
  let showRequestId = 0;
  let layoutPickerBtnEl, layoutDropdownEl;
  let slideJumpInputEl, fullscreenBtnEl, shellStatusEl;

  function ensurePaneRuntime() {
    if (!paneRuntimePromise) {
      paneRuntimePromise = Promise.all([
        import('../panes/code.js'),
        import('../panes/shell.js'),
        import('../panes/markdown.js'),
      ]).then(([codeModule, shellModule, markdownModule]) => ({
        CodePane: codeModule.CodePane,
        ShellPane: shellModule.ShellPane,
        MarkdownPane: markdownModule.MarkdownPane,
      })).catch((error) => {
        paneRuntimePromise = null;
        throw error;
      });
    }

    return paneRuntimePromise;
  }

  async function init() {
    if (initialized) return;
    if (initPromise) {
      await initPromise;
      return;
    }

    initPromise = (async () => {
      const { CodePane, ShellPane, MarkdownPane } = await ensurePaneRuntime();
      initialized = true;

      contentEl = document.getElementById('content');
      layoutPickerBtnEl = document.getElementById('layoutPickerBtn');
      layoutDropdownEl = document.getElementById('layoutDropdown');
      slideJumpInputEl = document.getElementById('slideJumpInput');
      fullscreenBtnEl = document.getElementById('fullscreenBtn');
      shellStatusEl = document.getElementById('shellStatus');
      resizer = new Resizer(contentEl);
      layoutManager = new LayoutManager(contentEl);

      codePane = new CodePane(
        document.getElementById('codeBody'),
        document.getElementById('langBadge'),
        document.getElementById('copyBtn'),
      );
      shellPane = new ShellPane(
        document.getElementById('shellBody'),
        {
          isDark: theme.isDark,
          deckId: currentDeckId || '',
          onStatusChange: ({ state, message }) => {
            if (!shellStatusEl) return;
            shellStatusEl.dataset.state = state;
            shellStatusEl.textContent = message;
          },
        },
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
    })().catch((error) => {
      initialized = false;
      initPromise = null;
      throw error;
    });

    await initPromise;
  }

  function setupSlideChangeHandler() {
    slideManager.onChange(({ slide, index, position, total, hasPrev, hasNext }) => {
      if (!slide) return;
      document.getElementById('slideTitle').textContent = slide.title || '';
      document.getElementById('slideCounter').textContent = `${position} / ${total}`;
      if (slideJumpInputEl) {
        slideJumpInputEl.max = String(total || 1);
        slideJumpInputEl.value = String(position);
      }
      document.getElementById('prevBtn').disabled = !hasPrev;
      document.getElementById('nextBtn').disabled = !hasNext;

      const progress = total > 1 ? ((position - 1) / (total - 1)) * 100 : 100;
      document.getElementById('progressFill').style.width = `${progress}%`;

      const resolved = resolveSlideCode(slide, presentationDeck);
      codePane.render(resolved.code, resolved.language, resolved.highlightLines);
      markdownPane.render(slide.markdown, {
        mermaidPreferenceScope: currentDeckId
          ? `presentation:${currentDeckId}:${index}`
          : `presentation:${index}`,
      });
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
    document.getElementById('slideJumpBtn').addEventListener('click', () => {
      const nextIndex = Math.max((parseInt(slideJumpInputEl?.value, 10) || 1) - 1, 0);
      slideManager.goTo(nextIndex);
    });
    slideJumpInputEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        document.getElementById('slideJumpBtn').click();
      }
    });
    document.getElementById('editDeckBtn').addEventListener('click', () => {
      if (!currentDeckId) return;
      router.navigate(`/deck/${currentDeckId}/edit`);
    });
    document.getElementById('shellReconnectBtn').addEventListener('click', () => shellPane?.reconnect());
    document.getElementById('shellClearBtn').addEventListener('click', () => shellPane?.clear());
    document.getElementById('shellResetBtn').addEventListener('click', () => shellPane?.reset());
    fullscreenBtnEl?.addEventListener('click', async () => {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    });
    document.addEventListener('fullscreenchange', () => {
      fullscreenBtnEl?.setAttribute('aria-pressed', document.fullscreenElement ? 'true' : 'false');
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
    syncPaneToggleButtons();
  }

  function syncPaneToggleButtons() {
    document.querySelectorAll('.toggle-btn').forEach((btn) => {
      const pane = btn.dataset.pane;
      const isActive = Boolean(paneState[pane]);
      const label = paneLabels[pane] || pane;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.setAttribute('aria-label', `${label}ペインの表示を切り替え`);
    });
  }

  function isLayoutDropdownOpen() {
    return Boolean(layoutDropdownEl && !layoutDropdownEl.hidden && layoutDropdownEl.classList.contains('open'));
  }

  function closeLayoutDropdown({ restoreFocus = false } = {}) {
    if (!layoutDropdownEl || !layoutPickerBtnEl) return;
    layoutDropdownEl.hidden = true;
    layoutDropdownEl.classList.remove('open');
    layoutPickerBtnEl.setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
      layoutPickerBtnEl.focus();
    }
  }

  function openLayoutDropdown() {
    if (!layoutDropdownEl || !layoutPickerBtnEl) return;
    layoutDropdownEl.hidden = false;
    layoutDropdownEl.classList.add('open');
    layoutPickerBtnEl.setAttribute('aria-expanded', 'true');
    const activeOption = layoutDropdownEl.querySelector('.layout-option.active') || layoutDropdownEl.querySelector('.layout-option');
    activeOption?.focus();
  }

  function toggleLayoutDropdown({ restoreFocus = false } = {}) {
    if (isLayoutDropdownOpen()) {
      closeLayoutDropdown({ restoreFocus });
    } else {
      openLayoutDropdown();
    }
  }

  function applyLayoutOption(optionBtn) {
    if (!optionBtn) return;
    layoutManager.setLayout(optionBtn.dataset.layout);
    rebuildLayout();
    syncLayoutPicker();
    closeLayoutDropdown({ restoreFocus: true });
  }

  function refreshPaneOrderControls() {
    document.querySelectorAll('.pane-order-item').forEach((item, index) => {
      const paneName = layoutManager.paneOrder[index];
      item.dataset.paneOrder = paneName;
      item.querySelector('.pane-order-rank').textContent = String(index + 1);
      item.querySelector('.pane-order-label').textContent = paneLabels[paneName] || paneName;

      const prevBtn = item.querySelector('.pane-move-prev');
      const nextBtn = item.querySelector('.pane-move-next');
      prevBtn.dataset.pane = paneName;
      nextBtn.dataset.pane = paneName;
      prevBtn.disabled = index === 0;
      nextBtn.disabled = index === layoutManager.paneOrder.length - 1;
    });
  }

  function setupLayoutPicker() {
    layoutPickerBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLayoutDropdown();
    });

    layoutPickerBtnEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleLayoutDropdown();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        openLayoutDropdown();
        return;
      }
      if (event.key === 'Escape' && isLayoutDropdownOpen()) {
        event.preventDefault();
        closeLayoutDropdown({ restoreFocus: true });
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.layout-picker')) {
        closeLayoutDropdown();
      }
    });

    document.querySelectorAll('.layout-option').forEach(btn => {
      btn.addEventListener('click', () => {
        applyLayoutOption(btn);
      });

      btn.addEventListener('keydown', (event) => {
        const options = [...document.querySelectorAll('.layout-option')];
        const currentIndex = options.indexOf(btn);
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          options[(currentIndex + 1) % options.length]?.focus();
          return;
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          options[(currentIndex - 1 + options.length) % options.length]?.focus();
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          applyLayoutOption(btn);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          closeLayoutDropdown({ restoreFocus: true });
        }
      });
    });

    document.querySelectorAll('.pane-move-prev, .pane-move-next').forEach((btn) => {
      btn.addEventListener('click', () => {
        const direction = btn.classList.contains('pane-move-prev') ? 'prev' : 'next';
        if (!layoutManager.movePaneByName(btn.dataset.pane, direction)) return;
        rebuildLayout();
        refreshPaneOrderControls();
      });
    });

    layoutDropdownEl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLayoutDropdown({ restoreFocus: true });
      }
    });

    closeLayoutDropdown();
    refreshPaneOrderControls();
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
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.target.closest('.xterm')) return;
      if (e.target.isContentEditable) return;
      if (document.getElementById('viewPresentation').style.display === 'none') return;
      if (isLayoutDropdownOpen() && e.key !== 'Escape') return;

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
        case 'f':
        case 'F':
          if (e.ctrlKey || e.metaKey || e.altKey) break;
          e.preventDefault();
          fullscreenBtnEl?.click();
          break;
        case 'r':
        case 'R':
          if (e.ctrlKey || e.metaKey || e.altKey) break;
          e.preventDefault();
          shellPane?.reconnect();
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
        case 'l':
        case 'L':
          if (e.ctrlKey || e.metaKey || e.altKey) break;
          e.preventDefault();
          toggleLayoutDropdown({ restoreFocus: true });
          break;
        case 'Escape':
          if (!isLayoutDropdownOpen()) break;
          e.preventDefault();
          closeLayoutDropdown({ restoreFocus: true });
          break;
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
    syncPaneToggleButtons();
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
      btn.setAttribute('aria-pressed', btn.dataset.layout === layoutManager.currentLayoutId ? 'true' : 'false');
    });
    refreshPaneOrderControls();
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
    await init();
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
