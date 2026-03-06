import fs from 'fs';
import { URL } from 'url';
import { WebSocketServer } from 'ws';
import { resolvePathWithinBase } from './path-config-utils.js';

function normalizeDeckId(deckId) {
    if (typeof deckId !== 'string') return '';
    const normalized = deckId.trim();
    return /^[a-zA-Z0-9_-]+$/.test(normalized) ? normalized : '';
}

function isAllowedOrigin(origin, allowedOrigins) {
    if (!origin) return false;
    return allowedOrigins.has(origin);
}

function readWsParamsFromRequest(req, wsPort) {
    try {
        const host = req.headers.host || `localhost:${wsPort}`;
        const url = new URL(req.url || '/', `ws://${host}`);
        return {
            deckId: url.searchParams.get('deckId') || '',
        };
    } catch {
        return { deckId: '' };
    }
}

function resolveDeckTerminalCwd(storage, deckId, baseCwd) {
    const safeDeckId = normalizeDeckId(deckId);
    if (!safeDeckId) return baseCwd;

    try {
        const deck = storage.readDeck(safeDeckId);
        const requestedCwd = typeof deck.terminal?.cwd === 'string'
            ? deck.terminal.cwd.trim()
            : '';
        if (!requestedCwd) return baseCwd;

        return resolvePathWithinBase(baseCwd, requestedCwd);
    } catch {
        return baseCwd;
    }
}

export async function startTerminalWsServer(getContext) {
    const { runtimeConfig } = getContext();
    if (!runtimeConfig.terminal.enabled) {
        console.log('Terminal server disabled (set TERMINAL_ENABLED=true to enable).');
        return null;
    }

    const ptyModule = await import('node-pty');
    const pty = ptyModule.default ?? ptyModule;

    const wss = new WebSocketServer({
        host: runtimeConfig.terminal.wsHost,
        port: runtimeConfig.terminal.wsPort,
        maxPayload: runtimeConfig.terminal.maxPayloadBytes,
    });
    wss.on('listening', () => {
        console.log(`Terminal server listening on ws://${runtimeConfig.terminal.wsHost}:${runtimeConfig.terminal.wsPort}`);
    });
    wss.on('error', (err) => {
        console.error(`Terminal server failed to start: ${err.message}`);
    });

    wss.on('connection', (ws, req) => {
        const { runtimeConfig: currentRuntimeConfig, storage } = getContext();
        const allowedOrigins = new Set(currentRuntimeConfig.terminal.allowedOrigins);
        const origin = req.headers.origin;
        const allowOrigin = isAllowedOrigin(
            origin,
            allowedOrigins,
        );

        if (!allowOrigin) {
            ws.close(1008, 'Origin not allowed');
            return;
        }

        if (wss.clients.size > currentRuntimeConfig.terminal.maxConnections) {
            ws.close(1013, 'Too many terminal sessions');
            return;
        }

        const wsParams = readWsParamsFromRequest(req, currentRuntimeConfig.terminal.wsPort);
        let ptyProcess = null;
        let idleTimer = null;

        const clearIdleTimer = () => {
            if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = null;
            }
        };

        const resetIdleTimer = () => {
            clearIdleTimer();
            idleTimer = setTimeout(() => {
                ws.close(1000, 'Session timed out');
            }, currentRuntimeConfig.terminal.idleTimeoutMs);
        };

        function cleanup() {
            clearIdleTimer();
            if (ptyProcess) {
                ptyProcess.kill();
                ptyProcess = null;
            }
        }

        try {
            const baseCwd = fs.existsSync(currentRuntimeConfig.terminal.baseCwd)
                ? currentRuntimeConfig.terminal.baseCwd
                : (currentRuntimeConfig.homeDir || process.cwd());
            const cwd = resolveDeckTerminalCwd(storage, wsParams.deckId, baseCwd);

            ptyProcess = pty.spawn(currentRuntimeConfig.terminal.shell, [], {
                name: 'xterm-256color',
                cols: 80,
                rows: 24,
                cwd,
                env: { ...process.env, TERM: 'xterm-256color' },
            });

            ptyProcess.onData((data) => {
                try {
                    ws.send(JSON.stringify({ type: 'output', data }));
                } catch {
                    // Ignore client disconnect race.
                }
            });

            ptyProcess.onExit(() => {
                ws.close();
            });

            resetIdleTimer();
        } catch {
            cleanup();
            ws.close(1011, 'Terminal startup failed');
            return;
        }

        ws.on('message', (raw) => {
            try {
                resetIdleTimer();

                const msg = JSON.parse(raw.toString());
                if (msg.type === 'input') {
                    ptyProcess.write(msg.data);
                    return;
                }

                if (msg.type === 'resize') {
                    ptyProcess.resize(
                        Math.max(msg.cols, 1),
                        Math.max(msg.rows, 1),
                    );
                }
            } catch {
                // Ignore malformed messages.
            }
        });

        ws.on('close', () => {
            cleanup();
        });

        ws.on('error', () => {
            cleanup();
        });
    });

    return wss;
}
