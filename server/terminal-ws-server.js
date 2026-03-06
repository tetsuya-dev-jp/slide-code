import fs from 'fs';
import { WebSocketServer } from 'ws';
import { resolvePathWithinBase } from './path-config-utils.js';

function normalizeDeckId(deckId) {
    if (typeof deckId !== 'string') return '';
    const normalized = deckId.trim();
    return /^[a-zA-Z0-9_-]+$/.test(normalized) ? normalized : '';
}

function isAllowedOrigin(origin, allowedOrigins, hasExplicitOriginConfig) {
    if (!origin) return false;
    if (allowedOrigins.has(origin)) return true;

    if (!hasExplicitOriginConfig && process.env.NODE_ENV !== 'production') {
        try {
            const originUrl = new URL(origin);
            return originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1';
        } catch {
            return false;
        }
    }

    return false;
}

function readWsParamsFromRequest(req, wsPort) {
    try {
        const host = req.headers.host || `localhost:${wsPort}`;
        const url = new URL(req.url || '/', `ws://${host}`);
        return {
            token: url.searchParams.get('token') || '',
            deckId: url.searchParams.get('deckId') || '',
        };
    } catch {
        return { token: '', deckId: '' };
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

    const wss = new WebSocketServer({ port: runtimeConfig.terminal.wsPort });
    wss.on('listening', () => {
        console.log(`Terminal server listening on ws://localhost:${runtimeConfig.terminal.wsPort}`);
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
            currentRuntimeConfig.terminal.hasExplicitOriginConfig,
        );

        if (!allowOrigin) {
            ws.close(1008, 'Origin not allowed');
            return;
        }

        const wsParams = readWsParamsFromRequest(req, currentRuntimeConfig.terminal.wsPort);
        const tokenRequired = currentRuntimeConfig.terminal.wsToken;
        if (tokenRequired && wsParams.token !== tokenRequired) {
            ws.close(1008, 'Unauthorized');
            return;
        }

        const baseCwd = fs.existsSync(currentRuntimeConfig.terminal.baseCwd)
            ? currentRuntimeConfig.terminal.baseCwd
            : (currentRuntimeConfig.homeDir || process.cwd());
        const cwd = resolveDeckTerminalCwd(storage, wsParams.deckId, baseCwd);

        const ptyProcess = pty.spawn(currentRuntimeConfig.terminal.shell, [], {
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

        ws.on('message', (raw) => {
            try {
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
            ptyProcess.kill();
        });

        ptyProcess.onExit(() => {
            ws.close();
        });
    });

    return wss;
}
