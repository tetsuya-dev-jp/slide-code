import fs from 'fs';
import path from 'path';
import { DECK_SCHEMA_VERSION, normalizeDeckPayload, normalizeNonEmptyString } from './deck-normalize.js';
import { writeJsonAtomic } from './fs-atomic.js';

function assertValidDeckId(deckId) {
    const normalized = normalizeNonEmptyString(deckId, '');
    if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) {
        throw new Error('invalid-deck-id');
    }
    return normalized;
}

function makeDeckExistsError() {
    const err = new Error('deck-already-exists');
    err.code = 'EEXIST';
    return err;
}

function normalizeDeckIdSeed(seed, fallback = 'deck') {
    const safeSeed = normalizeNonEmptyString(seed, fallback)
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '');
    return safeSeed || fallback;
}

function formatCopyTitle(sourceTitle, index = 1) {
    const normalizedTitle = normalizeNonEmptyString(sourceTitle, '無題のデッキ')
        .replace(/\s*\(コピー(?:\s+\d+)?\)\s*$/, '')
        .trim();
    const baseTitle = normalizedTitle || '無題のデッキ';
    if (index <= 1) return `${baseTitle} (コピー)`;
    return `${baseTitle} (コピー ${index})`;
}

export function resolveUniqueDeckId(storage, seed, fallback = 'deck') {
    const baseId = assertValidDeckId(normalizeDeckIdSeed(seed, fallback));
    if (!storage.hasDeck(baseId)) return baseId;

    let index = 2;
    while (true) {
        const candidate = `${baseId}-${index}`;
        if (!storage.hasDeck(candidate)) return candidate;
        index += 1;
    }
}

export function resolveUniqueCopyTitle(storage, sourceTitle) {
    const existingTitles = new Set(
        storage.listDecksMeta().map(deck => normalizeNonEmptyString(deck?.title, '')).filter(Boolean),
    );

    let copyIndex = 1;
    while (true) {
        const candidate = formatCopyTitle(sourceTitle, copyIndex);
        if (!existingTitles.has(candidate)) return candidate;
        copyIndex += 1;
    }
}

export function duplicateDeck(storage, deckId, payload = {}) {
    const safeDeckId = assertValidDeckId(deckId);
    const sourceDeck = storage.readDeck(safeDeckId);
    const input = payload && typeof payload === 'object' ? payload : {};
    const requestedId = typeof input.id === 'string' ? input.id.trim() : '';
    const nextDeckId = requestedId
        ? assertValidDeckId(requestedId)
        : resolveUniqueDeckId(storage, `${safeDeckId}-copy`, 'deck-copy');
    if (storage.hasDeck(nextDeckId)) throw makeDeckExistsError();

    const requestedTitle = normalizeNonEmptyString(input.title, '');
    const now = new Date().toISOString();
    const normalizedPayload = normalizeDeckPayload({
        title: requestedTitle || resolveUniqueCopyTitle(storage, sourceDeck.title),
        description: sourceDeck.description,
        files: sourceDeck.files,
        slides: sourceDeck.slides,
        terminal: sourceDeck.terminal,
        assets: sourceDeck.assets,
    });

    const duplicatedDeck = {
        schemaVersion: DECK_SCHEMA_VERSION,
        id: nextDeckId,
        title: normalizedPayload.title,
        description: normalizedPayload.description,
        createdAt: now,
        updatedAt: now,
        files: normalizedPayload.files,
        slides: normalizedPayload.slides,
        terminal: normalizedPayload.terminal,
        assets: normalizedPayload.assets,
    };

    storage.writeDeck(duplicatedDeck);
    try {
        storage.copyAssetsDirectory(safeDeckId, nextDeckId);
        return duplicatedDeck;
    } catch (err) {
        fs.rmSync(storage.getDeckDir(nextDeckId), { recursive: true, force: true });
        throw err;
    }
}

export function updateDeck(storage, deckId, partialPayload = {}) {
    const safeDeckId = assertValidDeckId(deckId);
    const existing = storage.readDeck(safeDeckId);
    const input = partialPayload && typeof partialPayload === 'object' ? partialPayload : {};
    const requestedId = typeof input.id === 'string' ? input.id.trim() : '';
    const nextDeckId = requestedId ? assertValidDeckId(requestedId) : safeDeckId;
    if (nextDeckId !== safeDeckId && storage.hasDeck(nextDeckId)) throw makeDeckExistsError();

    const merged = {
        ...existing,
        title: input.title ?? existing.title,
        description: input.description ?? existing.description,
        files: input.files ?? existing.files,
        slides: input.slides ?? existing.slides,
        terminal: input.terminal ?? existing.terminal,
        assets: input.assets ?? existing.assets,
    };
    const normalizedPayload = normalizeDeckPayload(merged);

    const updated = {
        ...existing,
        schemaVersion: DECK_SCHEMA_VERSION,
        id: nextDeckId,
        title: normalizedPayload.title,
        description: normalizedPayload.description,
        files: normalizedPayload.files,
        slides: normalizedPayload.slides,
        terminal: normalizedPayload.terminal,
        assets: normalizedPayload.assets,
        updatedAt: new Date().toISOString(),
    };
    storage.writeDeck(updated);

    if (nextDeckId === safeDeckId) {
        return updated;
    }

    try {
        storage.copyAssetsDirectory(safeDeckId, nextDeckId);
        fs.rmSync(storage.getDeckDir(safeDeckId), { recursive: true, force: true });
        return updated;
    } catch (err) {
        fs.rmSync(storage.getDeckDir(nextDeckId), { recursive: true, force: true });
        throw err;
    }
}

function moveDeckToQuarantine(storage, deckId, quarantineDir, reason) {
    const sourceDir = storage.getDeckDir(deckId);
    const quarantineDecksDir = path.join(quarantineDir, 'decks');
    fs.mkdirSync(quarantineDecksDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const targetDir = path.join(quarantineDecksDir, `${deckId}-${timestamp}`);
    fs.renameSync(sourceDir, targetDir);

    writeJsonAtomic(path.join(targetDir, 'quarantine.json'), {
        deckId,
        quarantinedAt: new Date().toISOString(),
        reason,
    });

    return targetDir;
}

export function quarantineInvalidDecks(storage, quarantineDir) {
    const quarantined = [];

    storage.listDeckIds().forEach((deckId) => {
        const deckJsonPath = storage.getDeckJsonPath(deckId);
        let reason = null;

        try {
            const raw = fs.readFileSync(deckJsonPath, 'utf-8');
            const manifest = JSON.parse(raw);
            if (manifest?.schemaVersion !== DECK_SCHEMA_VERSION) {
                reason = `unsupported-schema:${String(manifest?.schemaVersion ?? 'unknown')}`;
            }
        } catch (err) {
            reason = `invalid-deck:${err instanceof Error ? err.message : String(err)}`;
        }

        if (!reason) return;

        const targetDir = moveDeckToQuarantine(storage, deckId, quarantineDir, reason);
        quarantined.push({ deckId, reason, targetDir });
    });

    return quarantined;
}
