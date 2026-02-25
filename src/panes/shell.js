/**
 * Shell Pane — Interactive Terminal
 * Uses xterm.js + WebSocket to provide a real terminal experience
 */
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

const DARK_THEME = {
    background: '#1a1a2e',
    foreground: '#e0e0e0',
    cursor: '#e0e0e0',
    cursorAccent: '#1a1a2e',
    selectionBackground: 'rgba(99, 102, 241, 0.3)',
    black: '#1a1a2e',
    red: '#ff6b6b',
    green: '#51cf66',
    yellow: '#ffd43b',
    blue: '#748ffc',
    magenta: '#da77f2',
    cyan: '#66d9e8',
    white: '#e0e0e0',
    brightBlack: '#555580',
    brightRed: '#ff8787',
    brightGreen: '#69db7c',
    brightYellow: '#ffe066',
    brightBlue: '#91a7ff',
    brightMagenta: '#e599f7',
    brightCyan: '#99e9f2',
    brightWhite: '#ffffff',
};

const LIGHT_THEME = {
    background: '#fafafa',
    foreground: '#1e1e2e',
    cursor: '#1e1e2e',
    cursorAccent: '#fafafa',
    selectionBackground: 'rgba(99, 102, 241, 0.2)',
    black: '#1e1e2e',
    red: '#e03131',
    green: '#2f9e44',
    yellow: '#e8590c',
    blue: '#1971c2',
    magenta: '#9c36b5',
    cyan: '#0c8599',
    white: '#fafafa',
    brightBlack: '#868e96',
    brightRed: '#fa5252',
    brightGreen: '#40c057',
    brightYellow: '#fd7e14',
    brightBlue: '#339af0',
    brightMagenta: '#be4bdb',
    brightCyan: '#15aabf',
    brightWhite: '#ffffff',
};

export class ShellPane {
    constructor(shellBodyEl, options = {}) {
        this.shellBody = shellBodyEl;
        this.wsUrl = options.wsUrl || 'ws://localhost:3001';
        this.isDark = options.isDark !== false;

        this.terminal = null;
        this.fitAddon = null;
        this.ws = null;
        this.connected = false;
        this._resizeObserver = null;

        this._init();
    }

    _init() {
        // Clear any existing content
        this.shellBody.innerHTML = '';

        // Create terminal container
        this.containerEl = document.createElement('div');
        this.containerEl.className = 'xterm-container';
        this.shellBody.appendChild(this.containerEl);

        // Initialize xterm.js
        this.fitAddon = new FitAddon();

        this.terminal = new Terminal({
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
            fontSize: 13,
            lineHeight: 1.4,
            cursorBlink: true,
            cursorStyle: 'bar',
            scrollback: 5000,
            theme: this.isDark ? DARK_THEME : LIGHT_THEME,
            allowProposedApi: true,
        });

        this.terminal.loadAddon(this.fitAddon);
        this.terminal.loadAddon(new WebLinksAddon());

        // Open terminal in container
        this.terminal.open(this.containerEl);

        // Fit after a small delay to ensure DOM is ready
        requestAnimationFrame(() => {
            this._fit();
        });

        // Watch for container resizes
        this._resizeObserver = new ResizeObserver(() => {
            this._fit();
        });
        this._resizeObserver.observe(this.shellBody);

        // Connect to backend
        this._connect();

        // Forward user input to WebSocket
        this.terminal.onData((data) => {
            this._send({ type: 'input', data });
        });
    }

    _connect() {
        if (this.ws) {
            this.ws.close();
        }

        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
            this.connected = true;
            // Send initial size
            const dims = this.fitAddon.proposeDimensions();
            if (dims) {
                this._send({ type: 'resize', cols: dims.cols, rows: dims.rows });
            }
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'output') {
                    this.terminal.write(msg.data);
                }
            } catch (_) { /* ignore */ }
        };

        this.ws.onclose = () => {
            this.connected = false;
            this.terminal.write('\r\n\x1b[90m[接続が切れました — リロードで再接続]\x1b[0m\r\n');
        };

        this.ws.onerror = () => {
            this.connected = false;
        };
    }

    _send(msg) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    _fit() {
        try {
            this.fitAddon.fit();
            const dims = this.fitAddon.proposeDimensions();
            if (dims && this.connected) {
                this._send({ type: 'resize', cols: dims.cols, rows: dims.rows });
            }
        } catch (_) { /* container might not be visible */ }
    }

    /** Trigger a re-fit (call after layout changes) */
    fit() {
        requestAnimationFrame(() => this._fit());
    }

    /** Update theme */
    setTheme(isDark) {
        this.isDark = isDark;
        if (this.terminal) {
            this.terminal.options.theme = isDark ? DARK_THEME : LIGHT_THEME;
        }
    }

    /** Render is now a no-op — terminal is always live */
    render(_entries) {
        // The terminal is always interactive.
        // We ignore slide shell data.
    }

    /** Clean up resources */
    dispose() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
        }
        if (this.ws) {
            this.ws.close();
        }
        if (this.terminal) {
            this.terminal.dispose();
        }
    }
}
