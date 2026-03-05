import fs from 'fs';
import { normalizeNonEmptyString } from './deck-normalize.js';

function makeTemplateExistsError() {
    const err = new Error('template-already-exists');
    err.code = 'EEXIST';
    return err;
}

function makeTemplateNotFoundError() {
    const err = new Error('template-not-found');
    err.code = 'ENOENT';
    return err;
}

export function templateIdForDeck(deckId) {
    return `${deckId}-template`;
}

function templateIdPatternForDeck(deckId) {
    const escapedDeckId = deckId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escapedDeckId}-template(?:-\\d+)?$`);
}

function listTemplateIdsForDeck(localTemplateStorage, deckId) {
    const idPattern = templateIdPatternForDeck(deckId);
    return localTemplateStorage.listDeckIds().filter(templateId => idPattern.test(templateId));
}

function hasTemplateForDeck(localTemplateStorage, deckId) {
    return listTemplateIdsForDeck(localTemplateStorage, deckId).length > 0;
}

function withSource(meta, source) {
    return {
        source,
        id: meta.id,
        title: meta.title,
        description: meta.description,
        slideCount: meta.slideCount,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
    };
}

function listStorageTemplates(storage, source, { createIfMissing = false } = {}) {
    if (!storage) return [];
    if (!createIfMissing && !fs.existsSync(storage.decksDir)) return [];

    try {
        return storage.listDecksMeta().map(meta => withSource(meta, source));
    } catch {
        return [];
    }
}

export function listTemplates({ localTemplateStorage, sharedTemplateStorage }) {
    const local = listStorageTemplates(localTemplateStorage, 'local', { createIfMissing: true });
    const shared = listStorageTemplates(sharedTemplateStorage, 'shared', { createIfMissing: false });
    return {
        local,
        shared,
    };
}

function resolveSourceStorage(localTemplateStorage, sharedTemplateStorage, source) {
    if (source === 'shared') {
        return sharedTemplateStorage || null;
    }
    return localTemplateStorage;
}

export function createDeckFromTemplate({
    deckStorage,
    localTemplateStorage,
    sharedTemplateStorage,
    payload = {},
}) {
    const input = payload && typeof payload === 'object' ? payload : {};
    const source = typeof input.source === 'string' ? input.source : 'local';
    const templateId = typeof input.templateId === 'string' ? input.templateId.trim() : '';
    if (!templateId) {
        const err = new Error('missing-template-id');
        err.code = 'EINVAL';
        throw err;
    }

    const sourceStorage = resolveSourceStorage(localTemplateStorage, sharedTemplateStorage, source);
    if (!sourceStorage) {
        const err = new Error('template-source-not-found');
        err.code = 'ENOENT';
        throw err;
    }

    const templateDeck = sourceStorage.readDeck(templateId);
    const requestedDeckId = typeof input.id === 'string' ? input.id.trim() : '';
    const requestedTitle = typeof input.title === 'string' ? input.title.trim() : '';
    const requestedDescription = typeof input.description === 'string' ? input.description.trim() : '';

    const payloadForDeck = {
        title: requestedTitle || templateDeck.title,
        description: requestedDescription || templateDeck.description,
        files: templateDeck.files,
        slides: templateDeck.slides,
        terminal: templateDeck.terminal,
        assets: templateDeck.assets,
    };

    const createdDeck = requestedDeckId
        ? deckStorage.createDeckWithId(requestedDeckId, payloadForDeck)
        : deckStorage.createDeck(payloadForDeck);

    deckStorage.copyAssetsFromStorage(sourceStorage, templateDeck.id, createdDeck.id);
    return createdDeck;
}

export function saveTemplateFromDeck({
    deckStorage,
    localTemplateStorage,
    deckId,
    payload = {},
}) {
    const input = payload && typeof payload === 'object' ? payload : {};
    const deck = deckStorage.readDeck(deckId);

    const requestedId = typeof input.id === 'string' ? input.id.trim() : '';
    const requestedTitle = typeof input.title === 'string' ? input.title.trim() : '';
    const requestedDescription = typeof input.description === 'string' ? input.description.trim() : '';

    const templateId = requestedId
        ? requestedId
        : templateIdForDeck(deck.id);
    if (hasTemplateForDeck(localTemplateStorage, deck.id) || localTemplateStorage.hasDeck(templateId)) {
        throw makeTemplateExistsError();
    }

    const templateTitle = requestedTitle || `${normalizeNonEmptyString(deck.title, '無題のデッキ')} テンプレート`;

    const createdTemplate = localTemplateStorage.createDeckWithId(templateId, {
        title: templateTitle,
        description: requestedDescription || deck.description,
        files: deck.files,
        slides: deck.slides,
        terminal: deck.terminal,
        assets: deck.assets,
    });

    localTemplateStorage.copyAssetsFromStorage(deckStorage, deck.id, createdTemplate.id);
    return withSource(
        {
            id: createdTemplate.id,
            title: createdTemplate.title,
            description: createdTemplate.description,
            slideCount: createdTemplate.slides.length,
            createdAt: createdTemplate.createdAt,
            updatedAt: createdTemplate.updatedAt,
        },
        'local',
    );
}

export function removeTemplatesFromDeck({
    localTemplateStorage,
    deckId,
}) {
    const safeDeckId = normalizeNonEmptyString(deckId, '');
    if (!/^[a-zA-Z0-9_-]+$/.test(safeDeckId)) {
        throw new Error('invalid-deck-id');
    }

    const templateIds = listTemplateIdsForDeck(localTemplateStorage, safeDeckId);
    if (templateIds.length === 0) {
        throw makeTemplateNotFoundError();
    }

    templateIds.forEach((templateId) => {
        localTemplateStorage.deleteDeck(templateId);
    });

    return {
        removedCount: templateIds.length,
        removedTemplateIds: templateIds,
    };
}
