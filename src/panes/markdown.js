/**
 * Markdown Pane
 * Renders markdown with KaTeX math and Mermaid diagrams
 */

import 'katex/dist/katex.min.css';
import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
import { renderMarkdownDocument } from '../core/markdown-render.js';

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

function getNodeKey(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return '';

    const element = /** @type {HTMLElement} */ (node);
    if (element.tagName === 'IMG') {
        return `img:${element.getAttribute('src') || ''}`;
    }

    if (element.classList.contains('mermaid')) {
        return `mermaid:${element.getAttribute('id') || ''}`;
    }

    const elementChildren = Array.from(element.childNodes).filter(child => {
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

// Configure mermaid (theme-aware)
function initMermaid() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        themeVariables: isDark ? {
            primaryColor: '#21262d',
            primaryTextColor: '#e6edf3',
            primaryBorderColor: '#30363d',
            lineColor: '#8b949e',
            secondaryColor: '#161b22',
            tertiaryColor: '#1c2129',
            fontFamily: "'Inter', sans-serif",
        } : {
            primaryColor: '#dbeafe',
            primaryTextColor: '#1f2328',
            primaryBorderColor: '#d1d9e0',
            lineColor: '#59636e',
            secondaryColor: '#f0f2f5',
            tertiaryColor: '#f6f8fa',
            fontFamily: "'Inter', sans-serif",
        },
    });
}
initMermaid();

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
    async render(md) {
        // Re-init mermaid with current theme
        initMermaid();
        if (!md) {
            this.markdownBody.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-tertiary);font-size:var(--text-sm);">
          このスライドには解説がありません
        </div>
      `;
            return;
        }

        const { html } = renderMarkdownDocument(md, {
            resolveAssetUrl: this.resolveAssetUrl,
            mermaidIdPrefix: 'preview-mermaid',
        });

        morphBodyHtml(
            this.markdownBody,
            DOMPurify.sanitize(html, HTML_SANITIZE_OPTIONS),
        );

        // Render mermaid diagrams
        for (const el of this.markdownBody.querySelectorAll('.mermaid')) {
            try {
                const source = el.textContent || '';
                const renderId = `${el.id || 'preview-mermaid'}-svg-${this.mermaidId++}`;
                const { svg } = await mermaid.render(renderId, source);
                el.innerHTML = DOMPurify.sanitize(svg, MERMAID_SANITIZE_OPTIONS);
            } catch (e) {
                const errorPre = document.createElement('pre');
                errorPre.style.color = 'var(--accent-danger)';
                errorPre.textContent = e instanceof Error ? e.message : String(e);
                el.replaceChildren(errorPre);
            }
        }

        // Scroll to top
        if (this.resetScrollOnRender) {
            this.markdownBody.scrollTop = 0;
        }
    }
}
