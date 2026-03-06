import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
    DECK_SCHEMA_VERSION,
    DEFAULT_FILE,
    inferLanguageFromFilename,
    normalizeAssetPath,
    normalizeDeckPayload,
    normalizeNonEmptyString,
    normalizeRelativePath,
    normalizeString,
    resolvePathInsideRoot,
} from './deck-normalize.js';
import {
    copyDeckAssetsDirectory,
    copyDeckAssetsFromStorage,
    deleteDeckAsset,
    readDeckAsset,
    resolveUniqueDeckAssetPath,
    upsertDeckAsset,
} from './deck-assets.js';
import {
    duplicateDeck as duplicateDeckOp,
    quarantineInvalidDecks as quarantineInvalidDecksOp,
    resolveUniqueCopyTitle as resolveUniqueCopyTitleOp,
    resolveUniqueDeckId as resolveUniqueDeckIdOp,
    updateDeck as updateDeckOp,
} from './deck-storage-ops.js';
import { replaceDirectoryAtomic, writeJsonAtomic } from './fs-atomic.js';

function assertValidDeckId(deckId) {
    const normalized = normalizeNonEmptyString(deckId, '');
    if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) {
        throw new Error('invalid-deck-id');
    }
    return normalized;
}

function toDeckManifest(deck) {
    return {
        schemaVersion: DECK_SCHEMA_VERSION,
        id: deck.id,
        title: deck.title,
        description: deck.description,
        createdAt: deck.createdAt,
        updatedAt: deck.updatedAt,
        terminal: deck.terminal,
        files: deck.files.map(file => ({
            id: file.id,
            name: file.name,
            language: file.language,
        })),
        slides: deck.slides,
        assets: (deck.assets || []).map(asset => ({
            path: asset.path,
            mimeType: asset.mimeType,
            kind: asset.kind,
            size: asset.size,
        })),
    };
}

function makeDeckExistsError() {
    const err = new Error('deck-already-exists');
    err.code = 'EEXIST';
    return err;
}

function makeNotFoundError(message) {
    const err = new Error(message);
    err.code = 'ENOENT';
    return err;
}

function copyDirectoryContents(sourceDir, targetDir) {
    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
        fs.mkdirSync(targetDir, { recursive: true });
        return;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
    entries.forEach((entry) => {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDirectoryContents(sourcePath, targetPath);
            return;
        }
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(sourcePath, targetPath);
    });
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
                return fs.existsSync(path.join(this.decksDir, deckId, 'deck.json'));
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

    getDeckFilesDir(deckId) {
        return path.join(this.getDeckDir(deckId), 'files');
    }

    getDeckAssetsDir(deckId) {
        return path.join(this.getDeckDir(deckId), 'assets');
    }

    hasDeck(deckId) {
        const safeDeckId = assertValidDeckId(deckId);
        return fs.existsSync(this.getDeckJsonPath(safeDeckId));
    }

    getAssetAbsolutePath(deckId, assetPath) {
        const safeDeckId = assertValidDeckId(deckId);
        const assetsDir = this.getDeckAssetsDir(safeDeckId);
        const normalizedPath = normalizeAssetPath(assetPath, 'asset.bin');
        return resolvePathInsideRoot(assetsDir, normalizedPath);
    }

    readDeck(deckId) {
        const safeDeckId = assertValidDeckId(deckId);
        const deckDir = this.getDeckDir(safeDeckId);
        const deckJsonPath = this.getDeckJsonPath(safeDeckId);
        if (!fs.existsSync(deckJsonPath)) {
            throw makeNotFoundError('deck-not-found');
        }

        const raw = fs.readFileSync(deckJsonPath, 'utf-8');
        const manifest = JSON.parse(raw);
        if (manifest?.schemaVersion !== DECK_SCHEMA_VERSION) {
            throw new Error('unsupported-deck-schema');
        }

        const sourceFiles = Array.isArray(manifest.files) ? manifest.files : [];
        const files = sourceFiles.map((file, index) => {
            const fallbackName = index === 0 ? DEFAULT_FILE.name : `file${index + 1}.txt`;
            const name = normalizeRelativePath(file?.name, fallbackName);
            const language = normalizeNonEmptyString(file?.language, inferLanguageFromFilename(name));
            const id = normalizeNonEmptyString(file?.id, `file-${index + 1}`);

            let code = '';
            try {
                const codePath = resolvePathInsideRoot(path.join(deckDir, 'files'), name);
                if (fs.existsSync(codePath) && fs.statSync(codePath).isFile()) {
                    code = fs.readFileSync(codePath, 'utf-8');
                }
            } catch {
                code = '';
            }

            return { id, name, language, code };
        });

        const normalizedPayload = normalizeDeckPayload({
            title: manifest.title,
            description: manifest.description,
            files,
            slides: manifest.slides,
            terminal: manifest.terminal,
            assets: manifest.assets,
        });

        const assets = normalizedPayload.assets.map((asset) => {
            let exists = false;
            try {
                const assetPath = this.getAssetAbsolutePath(safeDeckId, asset.path);
                exists = fs.existsSync(assetPath) && fs.statSync(assetPath).isFile();
            } catch {
                exists = false;
            }
            return { ...asset, exists };
        });

        return {
            schemaVersion: DECK_SCHEMA_VERSION,
            id: normalizeNonEmptyString(manifest.id, safeDeckId),
            title: normalizedPayload.title,
            description: normalizedPayload.description,
            createdAt: normalizeNonEmptyString(manifest.createdAt, new Date().toISOString()),
            updatedAt: normalizeNonEmptyString(
                manifest.updatedAt,
                normalizeNonEmptyString(manifest.createdAt, new Date().toISOString()),
            ),
            files: normalizedPayload.files,
            slides: normalizedPayload.slides,
            terminal: normalizedPayload.terminal,
            assets,
        };
    }

    writeDeck(deck) {
        const safeDeckId = assertValidDeckId(deck.id);
        const deckDir = this.getDeckDir(safeDeckId);
        const manifest = toDeckManifest(deck);
        const currentAssetsDir = this.getDeckAssetsDir(safeDeckId);

        replaceDirectoryAtomic(deckDir, (tempDeckDir) => {
            const filesDir = path.join(tempDeckDir, 'files');
            const assetsDir = path.join(tempDeckDir, 'assets');

            fs.mkdirSync(filesDir, { recursive: true });
            copyDirectoryContents(currentAssetsDir, assetsDir);

            deck.files.forEach((file) => {
                const filePath = resolvePathInsideRoot(filesDir, file.name);
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                fs.writeFileSync(filePath, normalizeString(file.code, ''), 'utf-8');
            });

            writeJsonAtomic(path.join(tempDeckDir, 'deck.json'), manifest);
        });
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

    listQuarantinedDeckIssues(quarantineDir) {
        const quarantineDecksDir = typeof quarantineDir === 'string' && quarantineDir.trim()
            ? path.join(quarantineDir, 'decks')
            : '';
        if (!quarantineDecksDir || !fs.existsSync(quarantineDecksDir)) {
            return [];
        }

        return fs.readdirSync(quarantineDecksDir, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map((entry) => {
                const recordPath = path.join(quarantineDecksDir, entry.name, 'quarantine.json');
                if (!fs.existsSync(recordPath)) {
                    return {
                        deckId: entry.name,
                        reason: 'missing-quarantine-record',
                        quarantinedAt: '',
                        status: 'quarantined',
                    };
                }

                try {
                    const raw = fs.readFileSync(recordPath, 'utf-8');
                    const payload = JSON.parse(raw);
                    return {
                        deckId: normalizeNonEmptyString(payload?.deckId, entry.name),
                        reason: normalizeNonEmptyString(payload?.reason, 'unknown'),
                        quarantinedAt: normalizeNonEmptyString(payload?.quarantinedAt, ''),
                        status: 'quarantined',
                    };
                } catch {
                    return {
                        deckId: entry.name,
                        reason: 'invalid-quarantine-record',
                        quarantinedAt: '',
                        status: 'quarantined',
                    };
                }
            })
            .sort((a, b) => {
                const dateCompare = String(b.quarantinedAt || '').localeCompare(String(a.quarantinedAt || ''));
                if (dateCompare !== 0) return dateCompare;
                return a.deckId.localeCompare(b.deckId);
            });
    }

    createDeck(payload = {}) {
        const normalizedPayload = normalizeDeckPayload(payload);
        const requestedId = typeof payload?.id === 'string' ? payload.id.trim() : '';
        const resolvedId = requestedId ? assertValidDeckId(requestedId) : crypto.randomUUID();
        if (this.hasDeck(resolvedId)) throw makeDeckExistsError();

        const now = new Date().toISOString();
        const deck = {
            schemaVersion: DECK_SCHEMA_VERSION,
            id: resolvedId,
            title: normalizedPayload.title,
            description: normalizedPayload.description,
            createdAt: now,
            updatedAt: now,
            files: normalizedPayload.files,
            slides: normalizedPayload.slides,
            terminal: normalizedPayload.terminal,
            assets: normalizedPayload.assets,
        };
        this.writeDeck(deck);
        return deck;
    }

    createDeckWithId(deckId, payload = {}) {
        const safeDeckId = assertValidDeckId(deckId);
        if (this.hasDeck(safeDeckId)) throw makeDeckExistsError();

        const normalizedPayload = normalizeDeckPayload(payload);
        const now = new Date().toISOString();
        const deck = {
            schemaVersion: DECK_SCHEMA_VERSION,
            id: safeDeckId,
            title: normalizedPayload.title,
            description: normalizedPayload.description,
            createdAt: now,
            updatedAt: now,
            files: normalizedPayload.files,
            slides: normalizedPayload.slides,
            terminal: normalizedPayload.terminal,
            assets: normalizedPayload.assets,
        };
        this.writeDeck(deck);
        return deck;
    }

    resolveUniqueDeckId(seed, fallback = 'deck') {
        return resolveUniqueDeckIdOp(this, seed, fallback);
    }

    resolveUniqueCopyTitle(sourceTitle) {
        return resolveUniqueCopyTitleOp(this, sourceTitle);
    }

    copyAssetsDirectory(sourceDeckId, targetDeckId) {
        copyDeckAssetsDirectory(this, sourceDeckId, targetDeckId);
    }

    copyAssetsFromStorage(sourceStorage, sourceDeckId, targetDeckId) {
        copyDeckAssetsFromStorage(this, sourceStorage, sourceDeckId, targetDeckId);
    }

    duplicateDeck(deckId, payload = {}) {
        return duplicateDeckOp(this, deckId, payload);
    }

    updateDeck(deckId, partialPayload = {}) {
        return updateDeckOp(this, deckId, partialPayload);
    }

    resolveUniqueAssetPath(deckId, requestedPath) {
        return resolveUniqueDeckAssetPath(this, deckId, requestedPath);
    }

    upsertAsset(deckId, payload = {}) {
        return upsertDeckAsset(this, deckId, payload);
    }

    listDeckAssets(deckId) {
        return this.readDeck(deckId).assets;
    }

    readAsset(deckId, assetPath) {
        return readDeckAsset(this, deckId, assetPath);
    }

    deleteAsset(deckId, assetPath) {
        deleteDeckAsset(this, deckId, assetPath);
    }

    deleteDeck(deckId) {
        const safeDeckId = assertValidDeckId(deckId);
        const deckDir = this.getDeckDir(safeDeckId);
        if (!fs.existsSync(deckDir)) {
            throw makeNotFoundError('deck-not-found');
        }
        fs.rmSync(deckDir, { recursive: true, force: true });
    }

    quarantineInvalidDecks(quarantineDir) {
        return quarantineInvalidDecksOp(this, quarantineDir);
    }
}
