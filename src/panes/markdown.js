/**
 * Markdown Pane
 * Renders markdown with KaTeX math and Mermaid diagrams
 */

import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import mermaid from 'mermaid';

// Configure mermaid
mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
        primaryColor: '#21262d',
        primaryTextColor: '#e6edf3',
        primaryBorderColor: '#30363d',
        lineColor: '#8b949e',
        secondaryColor: '#161b22',
        tertiaryColor: '#1c2129',
        fontFamily: "'Inter', sans-serif",
    },
});

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
    constructor(markdownBodyEl) {
        this.markdownBody = markdownBodyEl;
        this.mermaidId = 0;

        // Configure marked
        marked.setOptions({
            gfm: true,
            breaks: true,
        });
    }

    /**
     * Render markdown content
     * @param {string} md - Markdown text
     */
    async render(md) {
        if (!md) {
            this.markdownBody.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-tertiary);font-size:var(--text-sm);">
          このスライドには解説がありません
        </div>
      `;
            return;
        }

        // Pre-process: Extract mermaid code blocks before marked parses them
        const mermaidBlocks = [];
        const mdProcessed = md.replace(/```mermaid\n([\s\S]*?)```/g, (match, code) => {
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

        this.markdownBody.innerHTML = html;

        // Render mermaid diagrams
        for (const block of mermaidBlocks) {
            try {
                const el = document.getElementById(block.id);
                if (el) {
                    const { svg } = await mermaid.render(block.id + '-svg', block.code);
                    el.innerHTML = svg;
                }
            } catch (e) {
                const el = document.getElementById(block.id);
                if (el) {
                    el.innerHTML = `<pre style="color:var(--accent-danger)">${e.message}</pre>`;
                }
            }
        }

        // Scroll to top
        this.markdownBody.scrollTop = 0;
    }
}
