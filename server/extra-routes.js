import { createDeckExportHtml, createDeckExportZip } from './export-service.js';
import {
    createDeckFromTemplate,
    listTemplates,
    removeTemplatesFromDeck,
    saveTemplateFromDeck,
} from './template-service.js';

function isNotFoundError(err) {
    return err?.code === 'ENOENT' || err?.message === 'deck-not-found' || err?.message === 'asset-not-found';
}

function isUnsupportedSchemaError(err) {
    return err?.message === 'unsupported-deck-schema';
}

function asQueryString(value) {
    if (Array.isArray(value)) return value[0] || '';
    return typeof value === 'string' ? value : '';
}

export function registerExtraRoutes(app, getContext) {
    app.get('/api/templates', (_req, res) => {
        try {
            const { templateStorage, sharedTemplateStorage } = getContext();
            res.json(listTemplates({
                localTemplateStorage: templateStorage,
                sharedTemplateStorage,
            }));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/decks/from-template', (req, res) => {
        try {
            const { storage, templateStorage, sharedTemplateStorage } = getContext();
            const created = createDeckFromTemplate({
                deckStorage: storage,
                localTemplateStorage: templateStorage,
                sharedTemplateStorage,
                payload: req.body,
            });
            res.status(201).json(created);
        } catch (err) {
            if (err.message === 'invalid-deck-id' || err.code === 'EINVAL' || err.message === 'missing-template-id') {
                return res.status(400).json({ error: 'Invalid template request' });
            }
            if (err.code === 'EEXIST' || err.message === 'deck-already-exists') {
                return res.status(409).json({ error: 'Deck folder already exists' });
            }
            if (isNotFoundError(err) || err.message === 'template-source-not-found') {
                return res.status(404).json({ error: 'Template not found' });
            }
            if (isUnsupportedSchemaError(err)) {
                return res.status(400).json({ error: 'Unsupported deck schema version' });
            }
            return res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/templates/from-deck/:id', (req, res) => {
        try {
            const { storage, templateStorage } = getContext();
            const templateMeta = saveTemplateFromDeck({
                deckStorage: storage,
                localTemplateStorage: templateStorage,
                deckId: req.params.id,
                payload: req.body,
            });
            res.status(201).json(templateMeta);
        } catch (err) {
            if (err.message === 'invalid-deck-id') {
                return res.status(400).json({ error: 'Invalid deck id' });
            }
            if (err.code === 'EEXIST' || err.message === 'deck-already-exists' || err.message === 'template-already-exists') {
                return res.status(409).json({ error: 'Template already exists' });
            }
            if (isNotFoundError(err)) {
                return res.status(404).json({ error: 'Deck not found' });
            }
            if (isUnsupportedSchemaError(err)) {
                return res.status(400).json({ error: 'Unsupported deck schema version' });
            }
            return res.status(500).json({ error: err.message });
        }
    });

    app.delete('/api/templates/from-deck/:id', (req, res) => {
        try {
            const { templateStorage } = getContext();
            const result = removeTemplatesFromDeck({
                localTemplateStorage: templateStorage,
                deckId: req.params.id,
            });
            res.json({ ok: true, ...result });
        } catch (err) {
            if (err.message === 'invalid-deck-id') {
                return res.status(400).json({ error: 'Invalid deck id' });
            }
            if (err.code === 'ENOENT' || err.message === 'template-not-found') {
                return res.status(404).json({ error: 'Template not found' });
            }
            return res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/decks/:id/assets', (req, res) => {
        try {
            const { storage } = getContext();
            const assets = storage.listDeckAssets(req.params.id);
            res.json({ assets });
        } catch (err) {
            if (err.message === 'invalid-deck-id') {
                return res.status(400).json({ error: 'Invalid deck id' });
            }
            if (isNotFoundError(err)) {
                return res.status(404).json({ error: 'Deck not found' });
            }
            if (isUnsupportedSchemaError(err)) {
                return res.status(400).json({ error: 'Unsupported deck schema version' });
            }
            return res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/decks/:id/assets', (req, res) => {
        try {
            const { storage } = getContext();
            const asset = storage.upsertAsset(req.params.id, req.body);
            const assets = storage.listDeckAssets(req.params.id);
            res.status(201).json({ asset, assets });
        } catch (err) {
            if (err.message === 'invalid-deck-id' || err.code === 'EINVAL' || err.message === 'invalid-asset-content') {
                return res.status(400).json({ error: 'Invalid asset payload' });
            }
            if (isNotFoundError(err)) {
                return res.status(404).json({ error: 'Deck not found' });
            }
            if (isUnsupportedSchemaError(err)) {
                return res.status(400).json({ error: 'Unsupported deck schema version' });
            }
            return res.status(500).json({ error: err.message });
        }
    });

    app.delete('/api/decks/:id/assets', (req, res) => {
        const requestedPath = asQueryString(req.query.path);
        if (!requestedPath) {
            return res.status(400).json({ error: 'Missing asset path' });
        }

        try {
            const { storage } = getContext();
            storage.deleteAsset(req.params.id, requestedPath);
            const assets = storage.listDeckAssets(req.params.id);
            res.json({ ok: true, assets });
        } catch (err) {
            if (err.message === 'invalid-deck-id') {
                return res.status(400).json({ error: 'Invalid deck id' });
            }
            if (isNotFoundError(err)) {
                return res.status(404).json({ error: 'Deck or asset not found' });
            }
            if (isUnsupportedSchemaError(err)) {
                return res.status(400).json({ error: 'Unsupported deck schema version' });
            }
            return res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/decks/:id/assets/file', (req, res) => {
        const requestedPath = asQueryString(req.query.path);
        if (!requestedPath) {
            return res.status(400).json({ error: 'Missing asset path' });
        }

        try {
            const { storage } = getContext();
            const asset = storage.readAsset(req.params.id, requestedPath);
            res.setHeader('Content-Type', asset.mimeType || 'application/octet-stream');
            res.setHeader('Cache-Control', 'no-store');
            res.send(asset.buffer);
        } catch (err) {
            if (err.message === 'invalid-deck-id') {
                return res.status(400).json({ error: 'Invalid deck id' });
            }
            if (isNotFoundError(err)) {
                return res.status(404).json({ error: 'Asset not found' });
            }
            if (isUnsupportedSchemaError(err)) {
                return res.status(400).json({ error: 'Unsupported deck schema version' });
            }
            return res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/decks/:id/export/:format', (req, res) => {
        const format = typeof req.params.format === 'string' ? req.params.format.toLowerCase() : '';

        try {
            const { storage } = getContext();
            if (format === 'html') {
                const result = createDeckExportHtml({
                    storage,
                    deckId: req.params.id,
                    printMode: false,
                });
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
                return res.send(result.html);
            }

            if (format === 'pdf') {
                const result = createDeckExportHtml({
                    storage,
                    deckId: req.params.id,
                    printMode: true,
                });
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Content-Disposition', 'inline');
                return res.send(result.html);
            }

            if (format === 'zip') {
                const result = createDeckExportZip({
                    storage,
                    deckId: req.params.id,
                });
                res.setHeader('Content-Type', 'application/zip');
                res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
                return res.send(result.buffer);
            }

            return res.status(400).json({ error: 'Unsupported export format' });
        } catch (err) {
            if (err.message === 'invalid-deck-id') {
                return res.status(400).json({ error: 'Invalid deck id' });
            }
            if (isNotFoundError(err)) {
                return res.status(404).json({ error: 'Deck not found' });
            }
            if (isUnsupportedSchemaError(err)) {
                return res.status(400).json({ error: 'Unsupported deck schema version' });
            }
            return res.status(500).json({ error: err.message });
        }
    });
}
