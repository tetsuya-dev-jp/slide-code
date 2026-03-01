/**
 * CodeStage Server
 * - Express REST API for deck CRUD (port 3000)
 * - WebSocket server for terminal PTY (port 3001)
 */
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import pty from 'node-pty';
import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DECKS_DIR = path.join(__dirname, '..', 'decks');
const PROJECT_ROOT = path.join(__dirname, '..');

const DEFAULT_FILE = {
    name: 'main.py',
    language: 'python',
    code: '',
};

// Ensure decks directory exists
if (!fs.existsSync(DECKS_DIR)) {
    fs.mkdirSync(DECKS_DIR, { recursive: true });
}

// ============================
// REST API Server
// ============================

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

/** Read a deck file */
function readDeck(filename) {
    const filePath = path.join(DECKS_DIR, filename);
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
}

/** Write a deck file */
function writeDeck(id, data) {
    const filePath = path.join(DECKS_DIR, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/** List all deck files */
function listDeckFiles() {
    return fs.readdirSync(DECKS_DIR).filter(f => f.endsWith('.json'));
}

function normalizeString(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

function normalizeNonEmptyString(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
}

function makeUniqueFilename(rawName, usedNames, fallbackBase = 'file', fallbackExt = '.txt') {
    const fallback = `${fallbackBase}${fallbackExt}`;
    const name = normalizeNonEmptyString(rawName, fallback);
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';

    let candidate = name;
    let index = 2;
    while (usedNames.has(candidate)) {
        candidate = `${base || fallbackBase}-${index}${ext}`;
        index++;
    }
    usedNames.add(candidate);
    return candidate;
}

function inferLanguageFromFilename(filename) {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.py')) return 'python';
    if (lower.endsWith('.js')) return 'javascript';
    if (lower.endsWith('.ts')) return 'typescript';
    if (lower.endsWith('.sh')) return 'bash';
    if (lower.endsWith('.md')) return 'markdown';
    if (lower.endsWith('.json')) return 'json';
    return 'plaintext';
}

function normalizeFiles(files) {
    const source = Array.isArray(files) ? files : [];
    const usedNames = new Set();
    const normalized = [];

    source.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object') return;

        const fallbackName = index === 0 ? DEFAULT_FILE.name : `file${index + 1}.txt`;
        const name = makeUniqueFilename(entry.name, usedNames, fallbackName.replace(/\..*$/, ''), fallbackName.includes('.') ? fallbackName.slice(fallbackName.lastIndexOf('.')) : '.txt');
        const language = normalizeNonEmptyString(entry.language, inferLanguageFromFilename(name));
        const code = normalizeString(entry.code, '');

        normalized.push({ name, language, code });
    });

    if (normalized.length === 0) {
        normalized.push({ ...DEFAULT_FILE });
    }

    return normalized;
}

function lineCountOfFile(file) {
    const code = normalizeString(file?.code, '');
    return Math.max(code.split('\n').length, 1);
}

function normalizeLineRange(lineRange, maxLine) {
    const max = Math.max(maxLine, 1);

    let start = Number.parseInt(Array.isArray(lineRange) ? lineRange[0] : undefined, 10);
    if (!Number.isFinite(start) || start < 1) start = 1;

    let end = Number.parseInt(Array.isArray(lineRange) ? lineRange[1] : undefined, 10);
    if (!Number.isFinite(end) || end < start) end = start;

    start = Math.min(start, max);
    end = Math.min(end, max);

    return [start, end];
}

function normalizeHighlightLines(highlightLines, start, end) {
    if (!Array.isArray(highlightLines)) return [];
    const values = new Set();

    highlightLines.forEach((value) => {
        const line = Number.parseInt(value, 10);
        if (!Number.isFinite(line)) return;
        if (line < start || line > end) return;
        values.add(line);
    });

    return Array.from(values).sort((a, b) => a - b);
}

function normalizeSlides(slides, files) {
    const source = Array.isArray(slides) ? slides : [];
    const fileNames = new Set(files.map(file => file.name));
    const fallbackFileRef = files[0]?.name || DEFAULT_FILE.name;
    const linesByFile = new Map(files.map(file => [file.name, lineCountOfFile(file)]));

    const normalized = source.map((entry, index) => {
        const title = normalizeNonEmptyString(entry?.title, `スライド ${index + 1}`);
        const requestedFileRef = normalizeString(entry?.fileRef, fallbackFileRef);
        const fileRef = fileNames.has(requestedFileRef) ? requestedFileRef : fallbackFileRef;
        const maxLine = linesByFile.get(fileRef) || 1;
        const lineRange = normalizeLineRange(entry?.lineRange, maxLine);
        const highlightLines = normalizeHighlightLines(entry?.highlightLines, lineRange[0], lineRange[1]);
        const markdown = normalizeString(entry?.markdown, '');

        return {
            title,
            fileRef,
            lineRange,
            highlightLines,
            markdown,
        };
    });

    if (normalized.length === 0) {
        normalized.push({
            title: 'スライド 1',
            fileRef: fallbackFileRef,
            lineRange: [1, 1],
            highlightLines: [],
            markdown: '',
        });
    }

    return normalized;
}

function normalizeDeckPayload(payload = {}) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const files = normalizeFiles(source.files);
    const slides = normalizeSlides(source.slides, files);

    return {
        title: normalizeNonEmptyString(source.title, '無題のデッキ'),
        description: normalizeString(source.description, ''),
        files,
        slides,
    };
}

// GET /api/decks — list all decks (metadata only)
app.get('/api/decks', (_req, res) => {
    try {
        const files = listDeckFiles();
        const decks = files.map(f => {
            try {
                const deck = readDeck(f);
                const normalizedPayload = normalizeDeckPayload(deck);
                return {
                    id: normalizeNonEmptyString(deck.id, f.replace(/\.json$/, '')),
                    title: normalizedPayload.title,
                    description: normalizedPayload.description,
                    slideCount: normalizedPayload.slides.length,
                    createdAt: normalizeNonEmptyString(deck.createdAt, ''),
                    updatedAt: normalizeNonEmptyString(deck.updatedAt, normalizeNonEmptyString(deck.createdAt, '')),
                };
            } catch {
                return null;
            }
        }).filter(Boolean);
        res.json(decks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/decks/:id — get full deck
app.get('/api/decks/:id', (req, res) => {
    try {
        const filePath = path.join(DECKS_DIR, `${req.params.id}.json`);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Deck not found' });
        }
        const deck = readDeck(`${req.params.id}.json`);
        const normalizedPayload = normalizeDeckPayload(deck);
        const normalizedDeck = {
            ...deck,
            id: normalizeNonEmptyString(deck.id, req.params.id),
            title: normalizedPayload.title,
            description: normalizedPayload.description,
            files: normalizedPayload.files,
            slides: normalizedPayload.slides,
            createdAt: normalizeNonEmptyString(deck.createdAt, new Date().toISOString()),
            updatedAt: normalizeNonEmptyString(deck.updatedAt, normalizeNonEmptyString(deck.createdAt, new Date().toISOString())),
        };
        res.json(normalizedDeck);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/decks — create a new deck
app.post('/api/decks', (req, res) => {
    try {
        const now = new Date().toISOString();
        const normalizedPayload = normalizeDeckPayload(req.body);
        const deck = {
            id: crypto.randomUUID(),
            title: normalizedPayload.title,
            description: normalizedPayload.description,
            createdAt: now,
            updatedAt: now,
            files: normalizedPayload.files,
            slides: normalizedPayload.slides,
        };
        writeDeck(deck.id, deck);
        res.status(201).json(deck);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/decks/:id — update a deck
app.put('/api/decks/:id', (req, res) => {
    try {
        const filePath = path.join(DECKS_DIR, `${req.params.id}.json`);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Deck not found' });
        }
        const existing = readDeck(`${req.params.id}.json`);
        const input = req.body && typeof req.body === 'object' ? req.body : {};
        const merged = {
            ...existing,
            title: input.title ?? existing.title,
            description: input.description ?? existing.description,
            files: input.files ?? existing.files,
            slides: input.slides ?? existing.slides,
        };
        const normalizedPayload = normalizeDeckPayload(merged);
        const updated = {
            ...existing,
            title: normalizedPayload.title,
            description: normalizedPayload.description,
            files: normalizedPayload.files,
            slides: normalizedPayload.slides,
            updatedAt: new Date().toISOString(),
        };
        writeDeck(req.params.id, updated);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/decks/:id — delete a deck
app.delete('/api/decks/:id', (req, res) => {
    try {
        const filePath = path.join(DECKS_DIR, `${req.params.id}.json`);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Deck not found' });
        }
        fs.unlinkSync(filePath);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const API_PORT = 3000;
app.listen(API_PORT, () => {
    console.log(`API server listening on http://localhost:${API_PORT}`);
});

// ============================
// Terminal WebSocket Server
// ============================

const WS_PORT = Number.parseInt(process.env.TERMINAL_WS_PORT || '3001', 10);
const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
const terminalCwd = process.env.TERMINAL_CWD || PROJECT_ROOT;
const terminalEnabled = process.env.TERMINAL_ENABLED
    ? process.env.TERMINAL_ENABLED === 'true'
    : process.env.NODE_ENV !== 'production';
const terminalWsToken = process.env.TERMINAL_WS_TOKEN || '';
const defaultAllowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
];
const allowedOrigins = new Set(
    (process.env.TERMINAL_WS_ALLOWED_ORIGINS
        ? process.env.TERMINAL_WS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
        : defaultAllowedOrigins)
);
const hasExplicitOriginConfig = Boolean(process.env.TERMINAL_WS_ALLOWED_ORIGINS);

function isAllowedOrigin(origin) {
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

function readTokenFromRequest(req) {
    try {
        const host = req.headers.host || `localhost:${WS_PORT}`;
        const url = new URL(req.url || '/', `ws://${host}`);
        return url.searchParams.get('token') || '';
    } catch {
        return '';
    }
}

if (terminalEnabled) {
    const wss = new WebSocketServer({ port: WS_PORT });
    console.log(`Terminal server listening on ws://localhost:${WS_PORT}`);

    wss.on('connection', (ws, req) => {
        const origin = req.headers.origin;
        if (!isAllowedOrigin(origin)) {
            ws.close(1008, 'Origin not allowed');
            return;
        }

        if (terminalWsToken) {
            const providedToken = readTokenFromRequest(req);
            if (providedToken !== terminalWsToken) {
                ws.close(1008, 'Unauthorized');
                return;
            }
        }

        console.log('Client connected — spawning PTY');

        const cwd = fs.existsSync(terminalCwd) ? terminalCwd : (process.env.HOME || process.cwd());
        const ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd,
            env: { ...process.env, TERM: 'xterm-256color' },
        });

        // PTY → Browser
        ptyProcess.onData((data) => {
            try {
                ws.send(JSON.stringify({ type: 'output', data }));
            } catch (_) { /* client disconnected */ }
        });

        // Browser → PTY
        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                switch (msg.type) {
                    case 'input':
                        ptyProcess.write(msg.data);
                        break;
                    case 'resize':
                        ptyProcess.resize(
                            Math.max(msg.cols, 1),
                            Math.max(msg.rows, 1),
                        );
                        break;
                }
            } catch (_) { /* ignore malformed messages */ }
        });

        // Cleanup
        ws.on('close', () => {
            console.log('Client disconnected — killing PTY');
            ptyProcess.kill();
        });

        ptyProcess.onExit(() => {
            ws.close();
        });
    });
} else {
    console.log('Terminal server disabled (set TERMINAL_ENABLED=true to enable).');
}
