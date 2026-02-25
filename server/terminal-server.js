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

// GET /api/decks — list all decks (metadata only)
app.get('/api/decks', (_req, res) => {
    try {
        const files = listDeckFiles();
        const decks = files.map(f => {
            try {
                const deck = readDeck(f);
                return {
                    id: deck.id,
                    title: deck.title,
                    description: deck.description || '',
                    slideCount: deck.slides?.length || 0,
                    createdAt: deck.createdAt,
                    updatedAt: deck.updatedAt,
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
        res.json(deck);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/decks — create a new deck
app.post('/api/decks', (req, res) => {
    try {
        const now = new Date().toISOString();
        const deck = {
            id: crypto.randomUUID(),
            title: req.body.title || '無題のデッキ',
            description: req.body.description || '',
            createdAt: now,
            updatedAt: now,
            slides: req.body.slides || [
                { title: 'スライド 1', code: '', language: 'python', highlightLines: [], markdown: '' }
            ],
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
        const updated = {
            ...existing,
            title: req.body.title ?? existing.title,
            description: req.body.description ?? existing.description,
            slides: req.body.slides ?? existing.slides,
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

const WS_PORT = 3001;
const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');

const wss = new WebSocketServer({ port: WS_PORT });

console.log(`Terminal server listening on ws://localhost:${WS_PORT}`);

wss.on('connection', (ws) => {
    console.log('Client connected — spawning PTY');

    const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME || process.cwd(),
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
