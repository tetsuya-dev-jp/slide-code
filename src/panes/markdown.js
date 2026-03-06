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
    constructor(markdownBodyEl, { resolveAssetUrl } = {}) {
        this.markdownBody = markdownBodyEl;
        this.mermaidId = 0;
        this.resolveAssetUrl = typeof resolveAssetUrl === 'function' ? resolveAssetUrl : null;
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

        this.markdownBody.innerHTML = DOMPurify.sanitize(html, HTML_SANITIZE_OPTIONS);

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
        this.markdownBody.scrollTop = 0;
    }
}
