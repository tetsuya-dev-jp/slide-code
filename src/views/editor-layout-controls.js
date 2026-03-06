export function setupEditorLayoutControls({ getMonacoEditor }) {
  setupSidebarHandle({ getMonacoEditor });
  setupEditorResizer({ getMonacoEditor });
  setupMarkdownResizer();
}

function layoutMonaco(getMonacoEditor) {
  const monacoEditor = getMonacoEditor();
  if (monacoEditor) monacoEditor.layout();
}

function setupEditorResizer({ getMonacoEditor }) {
  const bodyEl = document.querySelector('.editor-body');
  const sidebarEl = document.querySelector('.editor-sidebar');
  const resizerEl = document.getElementById('editorMainNarrativeResizer');
  if (!bodyEl || !sidebarEl || !resizerEl) return;

  const STORAGE_KEY = 'slidecode-editor-narrative-width';
  const minNarrativeWidth = 260;
  const minMainWidth = 420;
  const splitterSize = 8;

  const getMainAndNarrativeSpace = () => {
    const bodyWidth = bodyEl.getBoundingClientRect().width;
    const collapsed = bodyEl.classList.contains('sidebar-collapsed');
    const sidebarWidth = collapsed ? 0 : sidebarEl.getBoundingClientRect().width;
    const leftSplitterWidth = splitterSize;
    const rightSplitterWidth = splitterSize;
    const gap = parseFloat(getComputedStyle(bodyEl).columnGap) || 0;
    const gapCount = collapsed ? 3 : 4;
    const totalGap = gap * gapCount;
    return bodyWidth - sidebarWidth - leftSplitterWidth - rightSplitterWidth - totalGap;
  };

  const clampWidth = (rawWidth) => {
    if (window.matchMedia('(max-width: 1080px)').matches) {
      return Math.max(rawWidth, minNarrativeWidth);
    }

    const available = getMainAndNarrativeSpace();
    const maxNarrativeWidth = Math.max(minNarrativeWidth, available - minMainWidth);
    return Math.min(Math.max(rawWidth, minNarrativeWidth), maxNarrativeWidth);
  };

  const getBalancedNarrativeWidth = () => {
    if (window.matchMedia('(max-width: 1080px)').matches) {
      return minNarrativeWidth;
    }

    return getMainAndNarrativeSpace() / 2;
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
  } else {
    applyWidth(getBalancedNarrativeWidth());
  }

  let dragging = false;

  const onMouseMove = (event) => {
    if (!dragging) return;
    const rect = bodyEl.getBoundingClientRect();
    const nextWidth = rect.right - event.clientX;
    applyWidth(nextWidth);
    layoutMonaco(getMonacoEditor);
  };

  const onMouseUp = (event) => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing-h');
    resizerEl.classList.remove('dragging');

    const rect = bodyEl.getBoundingClientRect();
    const nextWidth = rect.right - event.clientX;
    applyWidth(nextWidth, true);

    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    layoutMonaco(getMonacoEditor);
  };

  resizerEl.addEventListener('mousedown', (event) => {
    if (window.matchMedia('(max-width: 1080px)').matches) return;
    event.preventDefault();
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
    layoutMonaco(getMonacoEditor);
  });
}

function setupSidebarHandle({ getMonacoEditor }) {
  const bodyEl = document.querySelector('.editor-body');
  const sidebarEl = document.querySelector('.editor-sidebar');
  const sidebarResizerEl = document.getElementById('editorSidebarResizer');
  const sidebarHandleBtn = document.getElementById('editorSidebarHandle');
  if (!bodyEl || !sidebarEl || !sidebarResizerEl || !sidebarHandleBtn) return;

  const WIDTH_KEY = 'slidecode-editor-sidebar-width';
  const COLLAPSED_KEY = 'slidecode-editor-sidebar-collapsed';
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
    layoutMonaco(getMonacoEditor);
  };

  const savedWidth = parseInt(localStorage.getItem(WIDTH_KEY), 10);
  if (Number.isFinite(savedWidth)) {
    bodyEl.style.setProperty('--editor-sidebar-width', `${savedWidth}px`);
  }

  setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');

  let dragging = false;

  const onMouseMove = (event) => {
    if (!dragging) return;

    const rect = bodyEl.getBoundingClientRect();
    const nextWidth = event.clientX - rect.left;

    if (bodyEl.classList.contains('sidebar-collapsed')) {
      setCollapsed(false, false);
    }

    applySidebarWidth(nextWidth);
    layoutMonaco(getMonacoEditor);
  };

  const onMouseUp = (event) => {
    if (!dragging) return;

    dragging = false;
    document.body.classList.remove('resizing-h');
    sidebarResizerEl.classList.remove('dragging');

    const rect = bodyEl.getBoundingClientRect();
    const nextWidth = event.clientX - rect.left;
    applySidebarWidth(nextWidth, true);

    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    layoutMonaco(getMonacoEditor);
  };

  sidebarResizerEl.addEventListener('mousedown', (event) => {
    if (window.matchMedia('(max-width: 860px)').matches) return;
    if (event.target === sidebarHandleBtn || sidebarHandleBtn.contains(event.target)) return;

    event.preventDefault();
    dragging = true;
    document.body.classList.add('resizing-h');
    sidebarResizerEl.classList.add('dragging');
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });

  sidebarResizerEl.addEventListener('dblclick', () => {
    if (window.matchMedia('(max-width: 860px)').matches) return;
    setCollapsed(!bodyEl.classList.contains('sidebar-collapsed'), true);
  });

  sidebarHandleBtn.addEventListener('mousedown', (event) => {
    event.stopPropagation();
  });

  sidebarHandleBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setCollapsed(!bodyEl.classList.contains('sidebar-collapsed'), true);
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

  const STORAGE_KEY = 'slidecode-editor-markdown-input-height';
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

  const onMouseMove = (event) => {
    if (!dragging) return;
    const rect = containerEl.getBoundingClientRect();
    const nextHeight = event.clientY - rect.top;
    applyHeight(nextHeight);
  };

  const onMouseUp = (event) => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing-v');
    resizerEl.classList.remove('dragging');

    const rect = containerEl.getBoundingClientRect();
    const nextHeight = event.clientY - rect.top;
    applyHeight(nextHeight, true);

    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  resizerEl.addEventListener('mousedown', (event) => {
    if (window.matchMedia('(max-width: 860px)').matches) return;
    event.preventDefault();
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
