/**
 * Code Pane
 * Renders code with syntax highlighting and line numbers using Highlight.js
 */

import hljs from 'highlight.js';

export class CodePane {
    constructor(codeBodyEl, langBadgeEl, copyBtnEl) {
        this.codeBody = codeBodyEl;
        this.langBadge = langBadgeEl;
        this.copyBtn = copyBtnEl;
        this.currentCode = '';

        this.copyBtn.addEventListener('click', () => this.copyCode());
    }

    /**
     * Render code with syntax highlighting
     * @param {string} code - Source code
     * @param {string} language - Language identifier
     * @param {number[]} highlightLines - Array of 1-based line numbers to highlight
     */
    render(code, language = 'python', highlightLines = []) {
        this.currentCode = code;
        this.langBadge.textContent = language;

        // Highlight the code
        let highlighted;
        try {
            highlighted = hljs.highlight(code, { language }).value;
        } catch {
            highlighted = hljs.highlightAuto(code).value;
        }

        // Split into lines and add line numbers
        const lines = highlighted.split('\n');
        // Remove trailing empty line
        if (lines.length > 0 && lines[lines.length - 1] === '') {
            lines.pop();
        }

        const highlightSet = new Set(highlightLines);
        const html = lines.map((line, i) => {
            const lineNum = i + 1;
            const isHL = highlightSet.has(lineNum);
            return `<div class="code-line${isHL ? ' line-highlight' : ''}">` +
                `<span class="line-number">${lineNum}</span>` +
                `<span class="line-content">${line || ' '}</span>` +
                `</div>`;
        }).join('');

        this.codeBody.innerHTML = `<pre><code class="hljs">${html}</code></pre>`;
    }

    /**
     * Copy code to clipboard
     */
    async copyCode() {
        try {
            await navigator.clipboard.writeText(this.currentCode);
            this.copyBtn.classList.add('copied');
            setTimeout(() => this.copyBtn.classList.remove('copied'), 1500);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }
}
