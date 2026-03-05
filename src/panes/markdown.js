/**
 * Markdown Pane
 * Renders markdown with KaTeX math and Mermaid diagrams
 */

import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import mermaid from 'mermaid';
import DOMPurify from 'dompurify';

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

/**
 * Process KaTeX math expressions in text
 * Supports $...$ for inline and $$...$$ for block math
 */
function processKaTeX(html) {
    // Block math: $$...$$
    html = html.replace(/\$\$([\s\S]*?)\$\$/g, (match, tex) => {
        try {
            return `<div class="katex-display">${katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false })}</div>`;
        } catch (e) {
            return `<div class="katex-error">${match}</div>`;
        }
    });

    // Inline math: $...$  (but not $$ )
    html = html.replace(/(?<!\$)\$(?!\$)(.*?)(?<!\$)\$(?!\$)/g, (match, tex) => {
        try {
            return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
        } catch (e) {
            return match;
        }
    });

    return html;
}

export class MarkdownPane {
    constructor(markdownBodyEl, { resolveAssetUrl } = {}) {
        this.markdownBody = markdownBodyEl;
        this.mermaidId = 0;
        this.resolveAssetUrl = typeof resolveAssetUrl === 'function' ? resolveAssetUrl : null;

        // Configure marked
        marked.setOptions({
            gfm: true,
            breaks: true,
        });
    }

    resolveAssetLinks(markdownText) {
        if (!this.resolveAssetUrl || typeof markdownText !== 'string' || !markdownText.includes('asset://')) {
            return markdownText;
        }

        return markdownText.replace(/asset:\/\/([^\s)"'`<>]+)/g, (match, assetPath) => {
            try {
                const resolved = this.resolveAssetUrl(assetPath);
                if (typeof resolved !== 'string' || !resolved) return match;
                return resolved;
            } catch {
                return match;
            }
        });
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

        // Pre-process: Extract mermaid code blocks before marked parses them
        const markdownWithResolvedAssets = this.resolveAssetLinks(md);
        const mermaidBlocks = [];
        const mdProcessed = markdownWithResolvedAssets.replace(/```mermaid\n([\s\S]*?)```/g, (match, code) => {
            const id = `mermaid-${this.mermaidId++}`;
            mermaidBlocks.push({ id, code: code.trim() });
            return `<div class="mermaid" id="${id}"></div>`;
        });

        // Pre-process: Protect KaTeX from marked
        let mathBlocks = [];
        let mathProcessed = mdProcessed.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
            const placeholder = `%%MATHBLOCK${mathBlocks.length}%%`;
            mathBlocks.push(match);
            return placeholder;
        });

        let mathInlines = [];
        mathProcessed = mathProcessed.replace(/(?<!\$)\$(?!\$)([^\n]*?)(?<!\$)\$(?!\$)/g, (match) => {
            const placeholder = `%%MATHINLINE${mathInlines.length}%%`;
            mathInlines.push(match);
            return placeholder;
        });

        // Parse markdown
        let html = marked.parse(mathProcessed);

        // Restore math expressions
        mathBlocks.forEach((expr, i) => {
            html = html.replace(`%%MATHBLOCK${i}%%`, expr);
        });
        mathInlines.forEach((expr, i) => {
            html = html.replace(`%%MATHINLINE${i}%%`, expr);
        });

        // Process KaTeX
        html = processKaTeX(html);

        // Process callouts (> [!NOTE], > [!TIP], etc.)
        html = html.replace(/<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
            (match, type, content) => {
                const typeLC = type.toLowerCase();
                const classMap = { note: 'callout-info', tip: 'callout-tip', important: 'callout-info', warning: 'callout-warn', caution: 'callout-warn' };
                return `<div class="callout ${classMap[typeLC] || 'callout-info'}"><strong>${type}</strong>${content}</div>`;
            }
        );

        this.markdownBody.innerHTML = DOMPurify.sanitize(html, HTML_SANITIZE_OPTIONS);

        // Render mermaid diagrams
        for (const block of mermaidBlocks) {
            try {
                const el = document.getElementById(block.id);
                if (el) {
                    const { svg } = await mermaid.render(block.id + '-svg', block.code);
                    el.innerHTML = DOMPurify.sanitize(svg, MERMAID_SANITIZE_OPTIONS);
                }
            } catch (e) {
                const el = document.getElementById(block.id);
                if (el) {
                    const errorPre = document.createElement('pre');
                    errorPre.style.color = 'var(--accent-danger)';
                    errorPre.textContent = e instanceof Error ? e.message : String(e);
                    el.replaceChildren(errorPre);
                }
            }
        }

        // Scroll to top
        this.markdownBody.scrollTop = 0;
    }
}
