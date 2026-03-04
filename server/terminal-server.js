/**
 * CodeStage Server
 * - Express REST API for deck CRUD
 * - WebSocket server for terminal PTY
 */
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import pty from 'node-pty';
import { WebSocketServer } from 'ws';
import { DeckStorage } from './deck-storage.js';
import { loadRuntimeConfig } from './runtime-config.js';
import { createSampleDeckPayload, SAMPLE_DECK_ID } from './sample-deck.js';

function normalizeDeckId(deckId) {
    if (typeof deckId !== 'string') return '';
    const normalized = deckId.trim();
    return /^[a-zA-Z0-9_-]+$/.test(normalized) ? normalized : '';
}

function normalizeRequestedPath(rawPath) {
    if (typeof rawPath !== 'string') return '';
    const trimmed = rawPath.trim().replace(/\\/g, '/');
    if (!trimmed) return '';

    const compact = trimmed.replace(/^\/+/, '');
    const segments = compact.split('/').filter(Boolean);
    if (segments.some(segment => segment === '..')) {
        throw new Error('invalid-path');
    }

    return segments.join('/');
}

function toPosixRelative(baseDir, targetDir) {
    const relative = path.relative(baseDir, targetDir);
    if (!relative || relative === '.') return '';
    return relative.split(path.sep).join('/');
}

function resolvePathWithinBase(baseDir, rawPath) {
    const normalizedPath = normalizeRequestedPath(rawPath);
    const resolved = normalizedPath
        ? path.resolve(baseDir, ...normalizedPath.split('/'))
        : baseDir;

    const relative = path.relative(baseDir, resolved);
    const escapesBase = relative.startsWith('..') || path.isAbsolute(relative);
    if (escapesBase) {
        throw new Error('path-outside-base');
    }

    if (!fs.existsSync(resolved)) {
        throw new Error('path-not-found');
    }

    if (!fs.statSync(resolved).isDirectory()) {
        throw new Error('not-a-directory');
    }

    return resolved;
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

const runtimeConfig = loadRuntimeConfig();
const storage = new DeckStorage(runtimeConfig.decksDir);
storage.ensureReady();

if (storage.isEmpty()) {
    storage.createDeckWithId(SAMPLE_DECK_ID, createSampleDeckPayload());
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/decks', (_req, res) => {
    try {
        res.json(storage.listDecksMeta());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/decks/:id', (req, res) => {
    try {
        const deck = storage.readDeck(req.params.id);
        res.json(deck);
    } catch (err) {
        if (err.message === 'invalid-deck-id') {
            return res.status(400).json({ error: 'Invalid deck id' });
        }
        if (err.code === 'ENOENT' || err.message === 'deck-not-found') {
            return res.status(404).json({ error: 'Deck not found' });
        }
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/decks', (req, res) => {
    try {
        const deck = storage.createDeck(req.body);
        res.status(201).json(deck);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/decks/:id', (req, res) => {
    try {
        const deck = storage.updateDeck(req.params.id, req.body);
        res.json(deck);
    } catch (err) {
        if (err.message === 'invalid-deck-id') {
            return res.status(400).json({ error: 'Invalid deck id' });
        }
        if (err.code === 'ENOENT' || err.message === 'deck-not-found') {
            return res.status(404).json({ error: 'Deck not found' });
        }
        return res.status(500).json({ error: err.message });
    }
});

app.delete('/api/decks/:id', (req, res) => {
    try {
        storage.deleteDeck(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        if (err.message === 'invalid-deck-id') {
            return res.status(400).json({ error: 'Invalid deck id' });
        }
        if (err.code === 'ENOENT' || err.message === 'deck-not-found') {
            return res.status(404).json({ error: 'Deck not found' });
        }
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/fs/dirs', (req, res) => {
    const requestedPath = Array.isArray(req.query.path)
        ? req.query.path[0]
        : req.query.path;

    try {
        const baseCwd = fs.existsSync(runtimeConfig.terminal.baseCwd)
            ? runtimeConfig.terminal.baseCwd
            : runtimeConfig.homeDir;
        const currentDir = resolvePathWithinBase(baseCwd, requestedPath || '');
        const parentDir = currentDir === baseCwd ? null : path.dirname(currentDir);

        const directories = fs.readdirSync(currentDir, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => ({
                name: entry.name,
                path: toPosixRelative(baseCwd, path.join(currentDir, entry.name)),
            }))
            .sort((left, right) => left.name.localeCompare(right.name));

        res.json({
            currentPath: toPosixRelative(baseCwd, currentDir),
            parentPath: parentDir ? toPosixRelative(baseCwd, parentDir) : null,
            directories,
        });
    } catch (err) {
        if (['invalid-path', 'path-outside-base', 'path-not-found', 'not-a-directory'].includes(err.message)) {
            return res.status(400).json({ error: 'Invalid directory path' });
        }
        return res.status(500).json({ error: err.message });
    }
});

const apiServer = app.listen(runtimeConfig.apiPort, () => {
    console.log(`API server listening on http://localhost:${runtimeConfig.apiPort}`);
    console.log(`Deck storage: ${runtimeConfig.decksDir}`);
    console.log(`Config file: ${runtimeConfig.configFilePath}`);
});

apiServer.on('error', (err) => {
    console.error(`API server failed to start: ${err.message}`);
});

if (runtimeConfig.terminal.enabled) {
    const allowedOrigins = new Set(runtimeConfig.terminal.allowedOrigins);
    const wss = new WebSocketServer({ port: runtimeConfig.terminal.wsPort });
    wss.on('listening', () => {
        console.log(`Terminal server listening on ws://localhost:${runtimeConfig.terminal.wsPort}`);
    });
    wss.on('error', (err) => {
        console.error(`Terminal server failed to start: ${err.message}`);
    });

    wss.on('connection', (ws, req) => {
        const origin = req.headers.origin;
        const allowOrigin = isAllowedOrigin(
            origin,
            allowedOrigins,
            runtimeConfig.terminal.hasExplicitOriginConfig,
        );

        if (!allowOrigin) {
            ws.close(1008, 'Origin not allowed');
            return;
        }

        const wsParams = readWsParamsFromRequest(req, runtimeConfig.terminal.wsPort);
        const tokenRequired = runtimeConfig.terminal.wsToken;
        if (tokenRequired && wsParams.token !== tokenRequired) {
            ws.close(1008, 'Unauthorized');
            return;
        }

        const baseCwd = fs.existsSync(runtimeConfig.terminal.baseCwd)
            ? runtimeConfig.terminal.baseCwd
            : (runtimeConfig.homeDir || process.cwd());
        const cwd = resolveDeckTerminalCwd(storage, wsParams.deckId, baseCwd);

        const ptyProcess = pty.spawn(runtimeConfig.terminal.shell, [], {
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
} else {
    console.log('Terminal server disabled (set TERMINAL_ENABLED=true to enable).');
}
