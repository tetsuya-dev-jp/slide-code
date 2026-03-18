/**
 * Markdown Pane
 * Renders markdown with KaTeX math and Mermaid diagrams
 */

import DOMPurify from 'dompurify';
import {
  clearMermaidDiagramPreference,
  getMermaidDiagramPreference,
  setMermaidDiagramPreference,
} from '../core/preferences.js';
import { getMermaidTheme, getThemeName } from '../core/theme-tokens.js';

const HTML_SANITIZE_OPTIONS = {
  USE_PROFILES: {
    html: true,
    svg: true,
    svgFilters: true,
  },
};

const MERMAID_SANITIZE_OPTIONS = {
  USE_PROFILES: {
    html: true,
    svg: true,
    svgFilters: true,
  },
  ADD_TAGS: ['foreignObject'],
  ADD_ATTR: ['xmlns', 'xmlns:xlink', 'xlink:href', 'xml:space'],
};
const MERMAID_SCALE_MIN = 0.7;
const MERMAID_SCALE_MAX = 1.8;
const MERMAID_SCALE_STEP = 0.15;

function getNodeKey(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = /** @type {HTMLElement} */ (node);
  if (element.tagName === 'IMG') {
    return `img:${element.getAttribute('src') || ''}`;
  }

  if (element.classList.contains('mermaid')) {
    return `mermaid:${element.getAttribute('id') || ''}`;
  }

  const elementChildren = Array.from(element.childNodes).filter((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      return Boolean(child.textContent?.trim());
    }
    return child.nodeType === Node.ELEMENT_NODE;
  });

  if (elementChildren.length === 1) {
    const onlyChild = elementChildren[0];
    if (onlyChild.nodeType === Node.ELEMENT_NODE && onlyChild.nodeName === 'IMG') {
      const imageSrc = onlyChild.getAttribute('src') || '';
      return imageSrc ? `image-block:${imageSrc}` : '';
    }
  }

  return '';
}

function canMorphNode(currentNode, nextNode) {
  if (!currentNode || !nextNode || currentNode.nodeType !== nextNode.nodeType) {
    return false;
  }

  if (currentNode.nodeType === Node.TEXT_NODE || currentNode.nodeType === Node.COMMENT_NODE) {
    return true;
  }

  if (currentNode.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  const currentElement = /** @type {HTMLElement} */ (currentNode);
  const nextElement = /** @type {HTMLElement} */ (nextNode);
  if (currentElement.tagName !== nextElement.tagName) {
    return false;
  }

  const currentKey = getNodeKey(currentElement);
  const nextKey = getNodeKey(nextElement);
  if (currentKey || nextKey) {
    return currentKey === nextKey;
  }

  return true;
}

function syncElementAttributes(targetEl, sourceEl) {
  const targetNames = targetEl.getAttributeNames();
  targetNames.forEach((name) => {
    if (!sourceEl.hasAttribute(name)) {
      targetEl.removeAttribute(name);
    }
  });

  sourceEl.getAttributeNames().forEach((name) => {
    targetEl.setAttribute(name, sourceEl.getAttribute(name) || '');
  });
}

function morphChildNodes(currentParent, nextParent) {
  const nextChildren = Array.from(nextParent.childNodes);
  let currentCursor = currentParent.firstChild;

  nextChildren.forEach((nextChild) => {
    const currentChild = currentCursor;
    if (!currentChild) {
      currentParent.appendChild(nextChild.cloneNode(true));
      return;
    }

    if (canMorphNode(currentChild, nextChild)) {
      morphNode(currentChild, nextChild);
      currentCursor = currentChild.nextSibling;
      return;
    }

    const nextKey = getNodeKey(nextChild);
    if (nextKey) {
      let keyedMatch = currentChild.nextSibling;
      while (keyedMatch) {
        if (canMorphNode(keyedMatch, nextChild) && getNodeKey(keyedMatch) === nextKey) {
          currentParent.insertBefore(keyedMatch, currentChild);
          morphNode(keyedMatch, nextChild);
          currentCursor = keyedMatch.nextSibling;
          return;
        }
        keyedMatch = keyedMatch.nextSibling;
      }
    }

    const replacement = nextChild.cloneNode(true);
    if (getNodeKey(currentChild)) {
      currentParent.insertBefore(replacement, currentChild);
      currentCursor = currentChild;
      return;
    }

    currentParent.replaceChild(replacement, currentChild);
    currentCursor = replacement.nextSibling;
  });

  while (currentCursor) {
    const nextNode = currentCursor.nextSibling;
    currentParent.removeChild(currentCursor);
    currentCursor = nextNode;
  }
}

function morphNode(currentNode, nextNode) {
  if (!canMorphNode(currentNode, nextNode)) {
    currentNode.replaceWith(nextNode.cloneNode(true));
    return;
  }

  if (currentNode.nodeType === Node.TEXT_NODE || currentNode.nodeType === Node.COMMENT_NODE) {
    if (currentNode.textContent !== nextNode.textContent) {
      currentNode.textContent = nextNode.textContent;
    }
    return;
  }

  const currentElement = /** @type {HTMLElement} */ (currentNode);
  const nextElement = /** @type {HTMLElement} */ (nextNode);
  syncElementAttributes(currentElement, nextElement);

  if (currentElement.tagName === 'IMG') {
    return;
  }

  morphChildNodes(currentElement, nextElement);
}

function morphBodyHtml(containerEl, sanitizedHtml) {
  const templateEl = document.createElement('template');
  templateEl.innerHTML = sanitizedHtml;
  morphChildNodes(containerEl, templateEl.content);
}

let markdownRuntimePromise = null;
let mermaidPromise = null;

async function loadMarkdownRuntime() {
  if (!markdownRuntimePromise) {
    markdownRuntimePromise = Promise.all([
      import('katex/dist/katex.min.css'),
      import('../core/markdown-render.js'),
    ]).then(([, module]) => module);
  }

  return markdownRuntimePromise;
}

async function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((module) => module.default);
  }

  return mermaidPromise;
}

// Configure mermaid (theme-aware)
async function initMermaid() {
  const themeName = getThemeName(document.documentElement.getAttribute('data-theme'));
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    theme: themeName === 'light' ? 'default' : 'dark',
    themeVariables: getMermaidTheme(themeName),
    flowchart: {
      htmlLabels: false,
      useMaxWidth: true,
    },
  });

  return mermaid;
}

function getMermaidBounds(svgEl) {
  const candidates = [
    svgEl.querySelector('g.output'),
    svgEl.querySelector('g[class*="output"]'),
    svgEl.querySelector('g'),
    svgEl,
  ];

  for (const candidate of candidates) {
    if (!(candidate instanceof SVGGraphicsElement) || typeof candidate.getBBox !== 'function') {
      continue;
    }

    try {
      const bounds = candidate.getBBox();
      if (bounds.width > 0 && bounds.height > 0) {
        return bounds;
      }
    } catch {
      // Ignore invalid bbox reads from intermediate SVG fragments.
    }
  }

  return null;
}

function getMermaidSizing(viewBoxWidth, viewBoxHeight) {
  const aspectRatio = viewBoxWidth / viewBoxHeight;

  if (aspectRatio >= 1.35) {
    return {
      layout: 'wide',
      targetWidth: Math.max(Math.round(viewBoxWidth), 560),
    };
  }

  if (aspectRatio <= 0.8) {
    return {
      layout: 'tall',
      targetWidth: Math.min(Math.max(Math.round(viewBoxWidth * 1.45), 340), 560),
    };
  }

  return {
    layout: 'balanced',
    targetWidth: Math.min(Math.max(Math.round(viewBoxWidth * 1.15), 420), 820),
  };
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function clampMermaidScale(scale) {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(Math.max(Number(scale.toFixed(2)), MERMAID_SCALE_MIN), MERMAID_SCALE_MAX);
}

function applyMermaidScale(svgEl, scale) {
  const nextScale = clampMermaidScale(scale);
  svgEl.style.setProperty('--mermaid-scale', String(nextScale));
  svgEl.dataset.mermaidScale = String(nextScale);
  return nextScale;
}

function createMermaidPreferenceId(source, index) {
  return `diagram-${index}-${hashString(source || '')}`;
}

function createMermaidControlsLabel(scale) {
  return `${Math.round(scale * 100)}%`;
}

function attachMermaidControls(containerEl, svgEl, { preferenceScope = '', diagramId = '' } = {}) {
  if (!(containerEl instanceof HTMLElement) || !(svgEl instanceof SVGElement)) return;

  const controlsEl = document.createElement('div');
  controlsEl.className = 'mermaid-controls';
  controlsEl.setAttribute('role', 'toolbar');
  controlsEl.setAttribute('aria-label', 'Mermaid 図のサイズ調整');

  const decreaseBtn = document.createElement('button');
  decreaseBtn.type = 'button';
  decreaseBtn.className = 'mermaid-control-btn';
  decreaseBtn.dataset.action = 'decrease';
  decreaseBtn.setAttribute('aria-label', 'Mermaid 図を小さくする');
  decreaseBtn.textContent = 'A-';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'mermaid-control-btn mermaid-control-reset';
  resetBtn.dataset.action = 'reset';
  resetBtn.setAttribute('aria-label', 'Mermaid 図のサイズを標準に戻す');
  resetBtn.textContent = '100%';

  const increaseBtn = document.createElement('button');
  increaseBtn.type = 'button';
  increaseBtn.className = 'mermaid-control-btn';
  increaseBtn.dataset.action = 'increase';
  increaseBtn.setAttribute('aria-label', 'Mermaid 図を大きくする');
  increaseBtn.textContent = 'A+';

  controlsEl.append(decreaseBtn, resetBtn, increaseBtn);
  containerEl.prepend(controlsEl);

  const storedScale =
    preferenceScope && diagramId
      ? getMermaidDiagramPreference(preferenceScope, diagramId)?.scale
      : null;
  let currentScale = applyMermaidScale(svgEl, storedScale ?? 1);
  resetBtn.textContent = createMermaidControlsLabel(currentScale);

  const syncButtons = () => {
    decreaseBtn.disabled = currentScale <= MERMAID_SCALE_MIN;
    increaseBtn.disabled = currentScale >= MERMAID_SCALE_MAX;
    resetBtn.disabled = currentScale === 1;
    resetBtn.textContent = createMermaidControlsLabel(currentScale);
  };

  const persistScale = (nextScale) => {
    currentScale = applyMermaidScale(svgEl, nextScale);
    syncButtons();

    if (!preferenceScope || !diagramId) {
      return;
    }

    if (currentScale === 1) {
      clearMermaidDiagramPreference(preferenceScope, diagramId);
      return;
    }

    setMermaidDiagramPreference({
      scope: preferenceScope,
      diagramId,
      scale: currentScale,
    });
  };

  controlsEl.addEventListener('click', (event) => {
    const button =
      event.target instanceof HTMLElement ? event.target.closest('button[data-action]') : null;
    if (!(button instanceof HTMLButtonElement)) return;

    const action = button.dataset.action;
    if (action === 'decrease') {
      persistScale(currentScale - MERMAID_SCALE_STEP);
      return;
    }
    if (action === 'increase') {
      persistScale(currentScale + MERMAID_SCALE_STEP);
      return;
    }
    persistScale(1);
  });

  syncButtons();
}

export function normalizeMermaidSvg(svgEl) {
  if (!(svgEl instanceof SVGElement)) return;

  const bounds = getMermaidBounds(svgEl);
  if (bounds) {
    const padding = 16;
    const viewBoxWidth = bounds.width + padding * 2;
    const viewBoxHeight = bounds.height + padding * 2;
    svgEl.setAttribute(
      'viewBox',
      `${bounds.x - padding} ${bounds.y - padding} ${viewBoxWidth} ${viewBoxHeight}`,
    );
    svgEl.style.aspectRatio = `${viewBoxWidth} / ${viewBoxHeight}`;
    const sizing = getMermaidSizing(viewBoxWidth, viewBoxHeight);
    svgEl.dataset.mermaidLayout = sizing.layout;
    svgEl.style.setProperty('--mermaid-target-width', `${sizing.targetWidth}px`);
  } else {
    delete svgEl.dataset.mermaidLayout;
    svgEl.style.removeProperty('--mermaid-target-width');
  }

  svgEl.removeAttribute('width');
  svgEl.removeAttribute('height');
  svgEl.style.display = 'block';
  svgEl.style.removeProperty('width');
  svgEl.style.removeProperty('max-width');
  svgEl.style.height = 'auto';
  svgEl.style.margin = '0 auto';
  svgEl.setAttribute('preserveAspectRatio', 'xMidYMin meet');
}

export class MarkdownPane {
  constructor(markdownBodyEl, { resolveAssetUrl, resetScrollOnRender = true } = {}) {
    this.markdownBody = markdownBodyEl;
    this.mermaidId = 0;
    this.resolveAssetUrl = typeof resolveAssetUrl === 'function' ? resolveAssetUrl : null;
    this.resetScrollOnRender = resetScrollOnRender !== false;
  }

  /**
   * Render markdown content
   * @param {string} md - Markdown text
   */
  async render(md, { mermaidPreferenceScope = '' } = {}) {
    if (!md) {
      this.markdownBody.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-tertiary);font-size:var(--text-sm);">
          このスライドには解説がありません
        </div>
      `;
      return;
    }

    const { renderMarkdownDocument } = await loadMarkdownRuntime();
    const { html } = renderMarkdownDocument(md, {
      resolveAssetUrl: this.resolveAssetUrl,
      mermaidIdPrefix: 'preview-mermaid',
    });

    morphBodyHtml(this.markdownBody, DOMPurify.sanitize(html, HTML_SANITIZE_OPTIONS));

    // Render mermaid diagrams
    const mermaidNodes = [...this.markdownBody.querySelectorAll('.mermaid')];
    if (mermaidNodes.length > 0) {
      const mermaid = await initMermaid();
      for (const [diagramIndex, el] of mermaidNodes.entries()) {
        try {
          const source = el.textContent || '';
          const renderId = `${el.id || 'preview-mermaid'}-svg-${this.mermaidId++}`;
          const { svg } = await mermaid.render(renderId, source);
          el.innerHTML = DOMPurify.sanitize(svg, MERMAID_SANITIZE_OPTIONS);
          const svgEl = el.querySelector('svg');
          normalizeMermaidSvg(svgEl);
          attachMermaidControls(el, svgEl, {
            preferenceScope: mermaidPreferenceScope,
            diagramId: createMermaidPreferenceId(source, diagramIndex),
          });
        } catch (e) {
          const errorPre = document.createElement('pre');
          errorPre.style.color = 'var(--accent-danger)';
          errorPre.textContent = e instanceof Error ? e.message : String(e);
          el.replaceChildren(errorPre);
        }
      }
    }

    // Scroll to top
    if (this.resetScrollOnRender) {
      this.markdownBody.scrollTop = 0;
    }
  }
}
