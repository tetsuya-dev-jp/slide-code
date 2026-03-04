import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
    DEFAULT_FILE,
    inferLanguageFromFilename,
    normalizeDeckPayload,
    normalizeNonEmptyString,
    normalizeRelativePath,
    normalizeString,
    resolvePathInsideRoot,
} from './deck-normalize.js';

function assertValidDeckId(deckId) {
    const normalized = normalizeNonEmptyString(deckId, '');
    if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) {
        throw new Error('invalid-deck-id');
    }
    return normalized;
}

function toDeckManifest(deck) {
    return {
        id: deck.id,
        title: deck.title,
        description: deck.description,
        createdAt: deck.createdAt,
        updatedAt: deck.updatedAt,
        terminal: deck.terminal,
        files: deck.files.map(file => ({
            name: file.name,
            language: file.language,
        })),
        slides: deck.slides,
    };
}

export class DeckStorage {
    constructor(decksDir) {
        this.decksDir = decksDir;
    }

    ensureReady() {
        fs.mkdirSync(this.decksDir, { recursive: true });
    }

    listDeckIds() {
        this.ensureReady();
        return fs.readdirSync(this.decksDir, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name)
            .filter((deckId) => {
                if (!/^[a-zA-Z0-9_-]+$/.test(deckId)) return false;
                const deckJsonPath = path.join(this.decksDir, deckId, 'deck.json');
                return fs.existsSync(deckJsonPath);
            })
            .sort((a, b) => a.localeCompare(b));
    }

    isEmpty() {
        return this.listDeckIds().length === 0;
    }

    getDeckDir(deckId) {
        const safeDeckId = assertValidDeckId(deckId);
        return path.join(this.decksDir, safeDeckId);
    }

    getDeckJsonPath(deckId) {
        return path.join(this.getDeckDir(deckId), 'deck.json');
    }

    readDeck(deckId) {
        const safeDeckId = assertValidDeckId(deckId);
        const deckDir = this.getDeckDir(safeDeckId);
        const deckJsonPath = this.getDeckJsonPath(safeDeckId);
        if (!fs.existsSync(deckJsonPath)) {
            const err = new Error('deck-not-found');
            err.code = 'ENOENT';
            throw err;
        }

        const raw = fs.readFileSync(deckJsonPath, 'utf-8');
        const manifest = JSON.parse(raw);
        const sourceFiles = Array.isArray(manifest.files) ? manifest.files : [];
        const files = sourceFiles.map((file, index) => {
            const fallbackName = index === 0 ? DEFAULT_FILE.name : `file${index + 1}.txt`;
            const name = normalizeRelativePath(file?.name, fallbackName);
            const language = normalizeNonEmptyString(file?.language, inferLanguageFromFilename(name));

            let code = '';
            try {
                const codePath = resolvePathInsideRoot(path.join(deckDir, 'files'), name);
                if (fs.existsSync(codePath) && fs.statSync(codePath).isFile()) {
                    code = fs.readFileSync(codePath, 'utf-8');
                }
            } catch {
                code = '';
            }

            return { name, language, code };
        });

        const normalizedPayload = normalizeDeckPayload({
            title: manifest.title,
            description: manifest.description,
            files,
            slides: manifest.slides,
            terminal: manifest.terminal,
        });

        return {
            id: normalizeNonEmptyString(manifest.id, safeDeckId),
            title: normalizedPayload.title,
            description: normalizedPayload.description,
            createdAt: normalizeNonEmptyString(manifest.createdAt, new Date().toISOString()),
            updatedAt: normalizeNonEmptyString(manifest.updatedAt, normalizeNonEmptyString(manifest.createdAt, new Date().toISOString())),
            files: normalizedPayload.files,
            slides: normalizedPayload.slides,
            terminal: normalizedPayload.terminal,
        };
    }

    writeDeck(deck) {
        const safeDeckId = assertValidDeckId(deck.id);
        const deckDir = this.getDeckDir(safeDeckId);
        const filesDir = path.join(deckDir, 'files');
        fs.mkdirSync(deckDir, { recursive: true });

        fs.rmSync(filesDir, { recursive: true, force: true });
        fs.mkdirSync(filesDir, { recursive: true });

        deck.files.forEach((file) => {
            const filePath = resolvePathInsideRoot(filesDir, file.name);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, normalizeString(file.code, ''), 'utf-8');
        });

        const manifest = toDeckManifest(deck);
        fs.writeFileSync(
            path.join(deckDir, 'deck.json'),
            `${JSON.stringify(manifest, null, 2)}\n`,
            'utf-8',
        );
    }

    listDecksMeta() {
        return this.listDeckIds()
            .map((deckId) => {
                try {
                    const deck = this.readDeck(deckId);
                    return {
                        id: deck.id,
                        title: deck.title,
                        description: deck.description,
                        slideCount: deck.slides.length,
                        createdAt: deck.createdAt,
                        updatedAt: deck.updatedAt,
                    };
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
    }

    createDeck(payload = {}) {
        const normalizedPayload = normalizeDeckPayload(payload);
        const now = new Date().toISOString();
        const deck = {
            id: crypto.randomUUID(),
            title: normalizedPayload.title,
            description: normalizedPayload.description,
            createdAt: now,
            updatedAt: now,
            files: normalizedPayload.files,
            slides: normalizedPayload.slides,
            terminal: normalizedPayload.terminal,
        };
        this.writeDeck(deck);
        return deck;
    }

    createDeckWithId(deckId, payload = {}) {
        const safeDeckId = assertValidDeckId(deckId);
        const normalizedPayload = normalizeDeckPayload(payload);
        const now = new Date().toISOString();
        const deck = {
            id: safeDeckId,
            title: normalizedPayload.title,
            description: normalizedPayload.description,
            createdAt: now,
            updatedAt: now,
            files: normalizedPayload.files,
            slides: normalizedPayload.slides,
            terminal: normalizedPayload.terminal,
        };
        this.writeDeck(deck);
        return deck;
    }

    updateDeck(deckId, partialPayload = {}) {
        const safeDeckId = assertValidDeckId(deckId);
        const existing = this.readDeck(safeDeckId);
        const input = partialPayload && typeof partialPayload === 'object' ? partialPayload : {};
        const merged = {
            ...existing,
            title: input.title ?? existing.title,
            description: input.description ?? existing.description,
            files: input.files ?? existing.files,
            slides: input.slides ?? existing.slides,
            terminal: input.terminal ?? existing.terminal,
        };
        const normalizedPayload = normalizeDeckPayload(merged);

        const updated = {
            ...existing,
            id: safeDeckId,
            title: normalizedPayload.title,
            description: normalizedPayload.description,
            files: normalizedPayload.files,
            slides: normalizedPayload.slides,
            terminal: normalizedPayload.terminal,
            updatedAt: new Date().toISOString(),
        };
        this.writeDeck(updated);
        return updated;
    }

    deleteDeck(deckId) {
        const safeDeckId = assertValidDeckId(deckId);
        const deckDir = this.getDeckDir(safeDeckId);
        if (!fs.existsSync(deckDir)) {
            const err = new Error('deck-not-found');
            err.code = 'ENOENT';
            throw err;
        }
        fs.rmSync(deckDir, { recursive: true, force: true });
    }
}
