import fs from 'fs';
import { DECK_SCHEMA_VERSION, normalizeDeckPayload, normalizeNonEmptyString } from './deck-normalize.js';

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
    storage.copyAssetsDirectory(safeDeckId, nextDeckId);
    return duplicatedDeck;
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

    if (nextDeckId !== safeDeckId) {
        storage.copyAssetsDirectory(safeDeckId, nextDeckId);
        fs.rmSync(storage.getDeckDir(safeDeckId), { recursive: true, force: true });
    }

    return updated;
}

export function removeLegacyDecks(storage) {
    let removedCount = 0;
    storage.listDeckIds().forEach((deckId) => {
        const deckJsonPath = storage.getDeckJsonPath(deckId);
        let shouldRemove = false;

        try {
            const raw = fs.readFileSync(deckJsonPath, 'utf-8');
            const manifest = JSON.parse(raw);
            shouldRemove = manifest?.schemaVersion !== DECK_SCHEMA_VERSION;
        } catch {
            shouldRemove = true;
        }

        if (!shouldRemove) return;
        fs.rmSync(storage.getDeckDir(deckId), { recursive: true, force: true });
        removedCount += 1;
    });

    return removedCount;
}
