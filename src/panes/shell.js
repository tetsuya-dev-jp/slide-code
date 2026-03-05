/**
 * Shell Pane — Interactive Terminal
 * Uses xterm.js + WebSocket to provide a real terminal experience
 */
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

const DARK_THEME = {
    background: '#0b0b0b',
    foreground: '#f2f2f2',
    cursor: '#d0ff6a',
    cursorAccent: '#0b0b0b',
    selectionBackground: 'rgba(183, 255, 26, 0.28)',
    black: '#0b0b0b',
    red: '#ef4444',
    green: '#b7ff1a',
    yellow: '#d6ff75',
    blue: '#8da2b1',
    magenta: '#b89ac7',
    cyan: '#78c5b2',
    white: '#f2f2f2',
    brightBlack: '#6f6f6f',
    brightRed: '#ff7d7d',
    brightGreen: '#d0ff6a',
    brightYellow: '#ecffad',
    brightBlue: '#b2c1cb',
    brightMagenta: '#d2bde8',
    brightCyan: '#9fd9cb',
    brightWhite: '#ffffff',
};

const LIGHT_THEME = {
    background: '#f2f2f2',
    foreground: '#0b0b0b',
    cursor: '#5f840f',
    cursorAccent: '#f2f2f2',
    selectionBackground: 'rgba(122, 169, 26, 0.24)',
    black: '#0b0b0b',
    red: '#c45f67',
    green: '#7aa91a',
    yellow: '#8a7419',
    blue: '#5f7482',
    magenta: '#78628e',
    cyan: '#3f7a70',
    white: '#f2f2f2',
    brightBlack: '#666666',
    brightRed: '#d57b83',
    brightGreen: '#8fbe2f',
    brightYellow: '#ae9228',
    brightBlue: '#758996',
    brightMagenta: '#8f79a4',
    brightCyan: '#59998d',
    brightWhite: '#ffffff',
};

function defaultWsUrl() {
    const configuredUrl = import.meta.env?.VITE_TERMINAL_WS_URL;
    if (configuredUrl) return configuredUrl;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const port = import.meta.env?.VITE_TERMINAL_WS_PORT || '3001';
    return `${protocol}//${host}:${port}`;
}

function buildWsUrl(wsUrl, deckId = '') {
    const token = import.meta.env?.VITE_TERMINAL_WS_TOKEN;

    try {
        const url = new URL(wsUrl, window.location.href);
        if (token) {
            url.searchParams.set('token', token);
        } else {
            url.searchParams.delete('token');
        }

        if (deckId) {
            url.searchParams.set('deckId', deckId);
        } else {
            url.searchParams.delete('deckId');
        }

        return url.toString();
    } catch {
        return wsUrl;
    }
}

export class ShellPane {
    constructor(shellBodyEl, options = {}) {
        this.shellBody = shellBodyEl;
        this.baseWsUrl = options.wsUrl || defaultWsUrl();
        this.deckId = typeof options.deckId === 'string' ? options.deckId : '';
        this.wsUrl = buildWsUrl(this.baseWsUrl, this.deckId);
        this.isDark = options.isDark !== false;

        this.terminal = null;
        this.fitAddon = null;
        this.ws = null;
        this.connected = false;
        this._resizeObserver = null;

        this._init();
    }

    setDeckId(deckId) {
        const nextDeckId = typeof deckId === 'string' ? deckId.trim() : '';
        if (nextDeckId === this.deckId) return;

        this.deckId = nextDeckId;
        this._refreshConnection();
    }

    reconnect() {
        this._refreshConnection();
    }

    _refreshConnection() {
        this.wsUrl = buildWsUrl(this.baseWsUrl, this.deckId);
        this._connect();
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
        const prevWs = this.ws;
        const ws = new WebSocket(this.wsUrl);
        this.ws = ws;

        if (prevWs) {
            prevWs.close();
        }

        ws.onopen = () => {
            if (this.ws !== ws) return;
            this.connected = true;
            // Send initial size
            const dims = this.fitAddon.proposeDimensions();
            if (dims) {
                this._send({ type: 'resize', cols: dims.cols, rows: dims.rows });
            }
        };

        ws.onmessage = (event) => {
            if (this.ws !== ws) return;
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'output') {
                    this.terminal.write(msg.data);
                }
            } catch (_) { /* ignore */ }
        };

        ws.onclose = () => {
            if (this.ws !== ws) return;
            this.connected = false;
            this.terminal.write('\r\n\x1b[90m[接続が切れました — リロードで再接続]\x1b[0m\r\n');
        };

        ws.onerror = () => {
            if (this.ws !== ws) return;
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
