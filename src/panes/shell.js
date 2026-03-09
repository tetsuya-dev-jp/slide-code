/**
 * Shell Pane — Interactive Terminal
 * Uses xterm.js + WebSocket to provide a real terminal experience
 */
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { getTerminalTheme, getThemeTokens } from '../core/theme-tokens.js';

function defaultWsUrl() {
    const configuredUrl = import.meta.env?.VITE_TERMINAL_WS_URL;
    if (configuredUrl) return configuredUrl;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const port = import.meta.env?.VITE_TERMINAL_WS_PORT || '3001';
    return `${protocol}//${host}:${port}`;
}

function buildWsUrl(wsUrl, deckId = '') {
    try {
        const url = new URL(wsUrl, window.location.href);
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
        this.onStatusChange = typeof options.onStatusChange === 'function' ? options.onStatusChange : null;

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

    clear() {
        this.terminal?.clear();
    }

    reset() {
        this.terminal?.clear();
        this._refreshConnection();
    }

    _setStatus(state, message = '') {
        this.onStatusChange?.({ state, message });
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
            fontFamily: `${getThemeTokens(this.isDark ? 'dark' : 'light').fontMono}, Menlo, Monaco, monospace`,
            fontSize: 13,
            lineHeight: 1.4,
            cursorBlink: true,
            cursorStyle: 'bar',
            scrollback: 5000,
            theme: getTerminalTheme(this.isDark ? 'dark' : 'light'),
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
            this._setStatus('connected', '接続中');
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

        ws.onclose = (event) => {
            if (this.ws !== ws) return;
            this.connected = false;
            const reason = event?.reason ? `: ${event.reason}` : '';
            this._setStatus('closed', '切断');
            this.terminal.write(`\r\n\x1b[90m[接続が切れました${reason} — 再接続してください]\x1b[0m\r\n`);
        };

        ws.onerror = () => {
            if (this.ws !== ws) return;
            this.connected = false;
            this._setStatus('error', '接続エラー');
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
            this.terminal.options.theme = getTerminalTheme(isDark ? 'dark' : 'light');
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
