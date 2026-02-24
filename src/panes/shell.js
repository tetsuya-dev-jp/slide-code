/**
 * Shell Pane
 * Renders shell commands and output with terminal styling
 * Uses a lightweight custom renderer (no xterm.js dependency for display-only mode)
 */

export class ShellPane {
    constructor(shellBodyEl) {
        this.shellBody = shellBodyEl;
    }

    /**
     * Render shell content
     * @param {Array} entries - Array of { type: 'command'|'output', text: string }
     *   or a simple string (rendered as output)
     */
    render(entries) {
        if (!entries || (Array.isArray(entries) && entries.length === 0)) {
            this.shellBody.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-tertiary);font-size:var(--text-sm);">
          このスライドにはシェル出力がありません
        </div>
      `;
            return;
        }

        // Support simple string input
        if (typeof entries === 'string') {
            entries = [{ type: 'output', text: entries }];
        }

        const html = entries.map(entry => {
            if (entry.type === 'command') {
                return `<div class="shell-line">` +
                    `<span class="shell-prompt">$ </span>` +
                    `<span class="shell-command">${this.escapeHtml(entry.text)}</span>` +
                    `</div>`;
            } else {
                return `<div class="shell-line">` +
                    `<span class="shell-output">${this.escapeHtml(entry.text)}</span>` +
                    `</div>`;
            }
        }).join('');

        this.shellBody.innerHTML = html + `<div class="shell-line"><span class="shell-prompt">$ </span><span class="shell-cursor"></span></div>`;
    }

    /**
     * Escape HTML entities
     */
    escapeHtml(str) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return str.replace(/[&<>"']/g, c => map[c]);
    }
}
