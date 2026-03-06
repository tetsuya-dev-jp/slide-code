import {
    readRawConfigFile,
    sanitizeConfigValue,
    writeRawConfigFile,
} from './path-config-utils.js';
import { API_ERROR_RULES, createApiError, withApiErrorHandling } from './api-errors.js';

const DECK_READ_ERROR_RULES = [
    API_ERROR_RULES.invalidDeckId,
    API_ERROR_RULES.deckNotFound,
    API_ERROR_RULES.unsupportedDeckSchema,
];

const DECK_WRITE_ERROR_RULES = [
    API_ERROR_RULES.invalidDeckId,
    API_ERROR_RULES.deckAlreadyExists,
    API_ERROR_RULES.deckNotFound,
    API_ERROR_RULES.unsupportedDeckSchema,
];

function createConfigResponse(runtimeConfig) {
    return {
        configFilePath: runtimeConfig.configFilePath,
        decksDir: runtimeConfig.decksDir,
        templatesDir: runtimeConfig.templatesDir,
        sharedTemplatesDir: runtimeConfig.sharedTemplatesDir,
        terminalBaseCwd: runtimeConfig.terminal.baseCwd,
        terminalShell: runtimeConfig.terminal.shell,
    };
}

export function registerApiRoutes(app, { getContext, applyLatestRuntimeConfig }) {
    app.get('/api/config', (_req, res) => {
        const { runtimeConfig } = getContext();
        res.json(createConfigResponse(runtimeConfig));
    });

    app.put('/api/config', withApiErrorHandling((req, res) => {
        const { runtimeConfig } = getContext();
        const payload = req.body && typeof req.body === 'object' ? req.body : {};
        const decksDir = sanitizeConfigValue(payload.decksDir);
        const templatesDir = sanitizeConfigValue(payload.templatesDir);
        const sharedTemplatesDir = sanitizeConfigValue(payload.sharedTemplatesDir, { allowEmpty: true });
        const terminalBaseCwd = sanitizeConfigValue(payload.terminalBaseCwd);
        const terminalShell = sanitizeConfigValue(payload.terminalShell, { allowEmpty: true });

        if (!decksDir || !templatesDir || !terminalBaseCwd) {
            throw createApiError(400, 'Invalid config value');
        }

        const currentRawConfig = readRawConfigFile(runtimeConfig.configFilePath);
        const currentRawTerminal = currentRawConfig.terminal && typeof currentRawConfig.terminal === 'object'
            ? currentRawConfig.terminal
            : {};

        writeRawConfigFile(runtimeConfig.configFilePath, {
            ...currentRawConfig,
            decksDir,
            templatesDir,
            sharedTemplatesDir,
            terminal: {
                ...currentRawTerminal,
                baseCwd: terminalBaseCwd,
                shell: terminalShell,
            },
        });

        applyLatestRuntimeConfig();
        const { runtimeConfig: latestRuntimeConfig } = getContext();
        res.json(createConfigResponse(latestRuntimeConfig));
    }));

    app.get('/api/decks', withApiErrorHandling((_req, res) => {
        const { storage } = getContext();
        res.json(storage.listDecksMeta());
    }));

    app.get('/api/decks/:id', withApiErrorHandling((req, res) => {
        const { storage } = getContext();
        res.json(storage.readDeck(req.params.id));
    }, DECK_READ_ERROR_RULES));

    app.post('/api/decks', withApiErrorHandling((req, res) => {
        const { storage } = getContext();
        const deck = storage.createDeck(req.body);
        res.status(201).json(deck);
    }, [
        API_ERROR_RULES.invalidDeckId,
        API_ERROR_RULES.deckAlreadyExists,
    ]));

    app.post('/api/decks/:id/duplicate', withApiErrorHandling((req, res) => {
        const { storage } = getContext();
        const deck = storage.duplicateDeck(req.params.id, req.body);
        res.status(201).json(deck);
    }, DECK_WRITE_ERROR_RULES));

    app.put('/api/decks/:id', withApiErrorHandling((req, res) => {
        const { storage } = getContext();
        res.json(storage.updateDeck(req.params.id, req.body));
    }, DECK_WRITE_ERROR_RULES));

    app.delete('/api/decks/:id', withApiErrorHandling((req, res) => {
        const { storage } = getContext();
        storage.deleteDeck(req.params.id);
        res.json({ ok: true });
    }, [
        API_ERROR_RULES.invalidDeckId,
        API_ERROR_RULES.deckNotFound,
    ]));
}
