/**
 * SlideCode Server
 * - Express REST API for deck CRUD
 * - WebSocket server for terminal PTY
 */
import cors from 'cors';
import express from 'express';
import { DeckStorage } from './deck-storage.js';
import { registerApiRoutes } from './api-routes.js';
import { registerFsRoutes } from './fs-routes.js';
import { loadRuntimeConfig } from './runtime-config.js';
import { registerExtraRoutes } from './extra-routes.js';
import { createSampleDeckAssets, createSampleDeckPayload, SAMPLE_DECK_ID } from './sample-deck.js';
import { startTerminalWsServer } from './terminal-ws-server.js';

function applyDynamicCors(getContext) {
    return cors({
        origin(origin, callback) {
            const { runtimeConfig } = getContext();
            if (!origin || runtimeConfig.apiAllowedOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error('origin-not-allowed'));
        },
    });
}

function quarantineInvalidDecks() {
    const quarantined = storage.quarantineInvalidDecks(runtimeConfig.quarantineDir);
    if (quarantined.length > 0) {
        console.warn(`Quarantined ${quarantined.length} invalid deck(s) in ${runtimeConfig.quarantineDir}`);
    }
}

let runtimeConfig = loadRuntimeConfig();
let storage = new DeckStorage(runtimeConfig.decksDir);
storage.ensureReady();
let templateStorage = new DeckStorage(runtimeConfig.templatesDir);
templateStorage.ensureReady();
let sharedTemplateStorage = runtimeConfig.sharedTemplatesDir
    ? new DeckStorage(runtimeConfig.sharedTemplatesDir)
    : null;

function ensureSampleDeck() {
    if (!storage.hasDeck(SAMPLE_DECK_ID)) {
        storage.createDeckWithId(SAMPLE_DECK_ID, createSampleDeckPayload());
    }

    const existingAssets = new Set(
        storage.listDeckAssets(SAMPLE_DECK_ID).filter(asset => asset.exists).map(asset => asset.path),
    );
    createSampleDeckAssets().forEach((asset) => {
        if (existingAssets.has(asset.path)) return;
        storage.upsertAsset(SAMPLE_DECK_ID, {
            path: asset.path,
            mimeType: asset.mimeType,
            kind: asset.kind,
            buffer: asset.buffer,
        });
    });
}

function applyLatestRuntimeConfig() {
    runtimeConfig = loadRuntimeConfig();
    storage = new DeckStorage(runtimeConfig.decksDir);
    storage.ensureReady();
    templateStorage = new DeckStorage(runtimeConfig.templatesDir);
    templateStorage.ensureReady();
    sharedTemplateStorage = runtimeConfig.sharedTemplatesDir
        ? new DeckStorage(runtimeConfig.sharedTemplatesDir)
        : null;
    quarantineInvalidDecks();
    ensureSampleDeck();
}

quarantineInvalidDecks();
ensureSampleDeck();

const app = express();
app.use(express.json({ limit: '10mb' }));

function getContext() {
    return {
        runtimeConfig,
        storage,
        templateStorage,
        sharedTemplateStorage,
    };
}

const corsMiddleware = applyDynamicCors(getContext);
app.use((req, res, next) => {
    corsMiddleware(req, res, (err) => {
        if (err) {
            res.status(403).json({ error: 'Origin not allowed' });
            return;
        }
        next();
    });
});

registerApiRoutes(app, {
    getContext,
    applyLatestRuntimeConfig,
});

registerFsRoutes(app, () => runtimeConfig);

registerExtraRoutes(app, getContext);

const apiServer = app.listen(runtimeConfig.apiPort, runtimeConfig.apiHost, () => {
    console.log(`API server listening on http://${runtimeConfig.apiHost}:${runtimeConfig.apiPort}`);
    console.log(`Deck storage: ${runtimeConfig.decksDir}`);
    console.log(`Config file: ${runtimeConfig.configFilePath}`);
});

apiServer.on('error', (err) => {
    console.error(`API server failed to start: ${err.message}`);
});

startTerminalWsServer(getContext).catch((err) => {
    console.error(`Terminal server failed to start: ${err.message}`);
});
