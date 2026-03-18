import fs from 'fs';
import path from 'path';
import { DeckStorage } from './deck-storage.js';
import {
  readRawConfigFile,
  resolveSystemPath,
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
    decksDir: runtimeConfig.decksDir,
    templatesDir: runtimeConfig.templatesDir,
    sharedTemplatesDir: runtimeConfig.sharedTemplatesDir,
    terminalBaseCwd: runtimeConfig.terminal.baseCwd,
    terminalShell: runtimeConfig.terminal.shell,
  };
}

function resolveConfigDirectoryCandidate(rawValue, homeDir) {
  const value = sanitizeConfigValue(rawValue);
  if (!value) {
    throw createApiError(400, 'Invalid config value');
  }
  if (value === '~') return homeDir;
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(homeDir, value.slice(2));
  }
  if (path.isAbsolute(value)) return value;
  return path.resolve(homeDir, value);
}

function ensureWritableDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
}

function validateConfigPayload(runtimeConfig, payload) {
  const homeDir = runtimeConfig.homeDir || process.cwd();
  const resolvedDecksDir = resolveConfigDirectoryCandidate(payload.decksDir, homeDir);
  const resolvedTemplatesDir = resolveConfigDirectoryCandidate(payload.templatesDir, homeDir);
  const resolvedSharedTemplatesDir = payload.sharedTemplatesDir
    ? resolveConfigDirectoryCandidate(payload.sharedTemplatesDir, homeDir)
    : '';

  resolveSystemPath(payload.terminalBaseCwd, homeDir);
  ensureWritableDirectory(resolvedDecksDir);
  ensureWritableDirectory(resolvedTemplatesDir);
  if (resolvedSharedTemplatesDir) {
    ensureWritableDirectory(resolvedSharedTemplatesDir);
  }

  new DeckStorage(resolvedDecksDir).ensureReady();
  new DeckStorage(resolvedTemplatesDir).ensureReady();
  if (resolvedSharedTemplatesDir) {
    new DeckStorage(resolvedSharedTemplatesDir).ensureReady();
  }
}

export function registerApiRoutes(app, { getContext, applyLatestRuntimeConfig }) {
  app.get('/api/config', (_req, res) => {
    const { runtimeConfig } = getContext();
    res.json(createConfigResponse(runtimeConfig));
  });

  app.put(
    '/api/config',
    withApiErrorHandling((req, res) => {
      const { runtimeConfig } = getContext();
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const decksDir = sanitizeConfigValue(payload.decksDir);
      const templatesDir = sanitizeConfigValue(payload.templatesDir);
      const sharedTemplatesDir = sanitizeConfigValue(payload.sharedTemplatesDir, {
        allowEmpty: true,
      });
      const terminalBaseCwd = sanitizeConfigValue(payload.terminalBaseCwd);
      const terminalShell = sanitizeConfigValue(payload.terminalShell, { allowEmpty: true });

      if (!decksDir || !templatesDir || !terminalBaseCwd) {
        throw createApiError(400, 'Invalid config value');
      }

      validateConfigPayload(runtimeConfig, {
        decksDir,
        templatesDir,
        sharedTemplatesDir,
        terminalBaseCwd,
      });

      const currentRawConfig = readRawConfigFile(runtimeConfig.configFilePath);
      const currentRawTerminal =
        currentRawConfig.terminal && typeof currentRawConfig.terminal === 'object'
          ? currentRawConfig.terminal
          : {};

      const nextRawConfig = {
        ...currentRawConfig,
        decksDir,
        templatesDir,
        sharedTemplatesDir,
        terminal: {
          ...currentRawTerminal,
          baseCwd: terminalBaseCwd,
          shell: terminalShell,
        },
      };

      try {
        writeRawConfigFile(runtimeConfig.configFilePath, nextRawConfig);
        applyLatestRuntimeConfig();
      } catch (err) {
        writeRawConfigFile(runtimeConfig.configFilePath, currentRawConfig);
        applyLatestRuntimeConfig();
        throw err;
      }

      const { runtimeConfig: latestRuntimeConfig } = getContext();
      res.json(createConfigResponse(latestRuntimeConfig));
    }),
  );

  app.get(
    '/api/decks',
    withApiErrorHandling((_req, res) => {
      const { storage } = getContext();
      res.json(storage.listDecksMeta());
    }),
  );

  app.get(
    '/api/decks/issues',
    withApiErrorHandling((_req, res) => {
      const { storage, runtimeConfig } = getContext();
      res.json(storage.listQuarantinedDeckIssues(runtimeConfig.quarantineDir));
    }),
  );

  app.get(
    '/api/decks/:id',
    withApiErrorHandling((req, res) => {
      const { storage } = getContext();
      res.json(storage.readDeck(req.params.id));
    }, DECK_READ_ERROR_RULES),
  );

  app.post(
    '/api/decks',
    withApiErrorHandling(
      (req, res) => {
        const { storage } = getContext();
        const deck = storage.createDeck(req.body);
        res.status(201).json(deck);
      },
      [API_ERROR_RULES.invalidDeckId, API_ERROR_RULES.deckAlreadyExists],
    ),
  );

  app.post(
    '/api/decks/:id/duplicate',
    withApiErrorHandling((req, res) => {
      const { storage } = getContext();
      const deck = storage.duplicateDeck(req.params.id, req.body);
      res.status(201).json(deck);
    }, DECK_WRITE_ERROR_RULES),
  );

  app.put(
    '/api/decks/:id',
    withApiErrorHandling((req, res) => {
      const { storage } = getContext();
      res.json(storage.updateDeck(req.params.id, req.body));
    }, DECK_WRITE_ERROR_RULES),
  );

  app.delete(
    '/api/decks/:id',
    withApiErrorHandling(
      (req, res) => {
        const { storage } = getContext();
        storage.deleteDeck(req.params.id);
        res.json({ ok: true });
      },
      [API_ERROR_RULES.invalidDeckId, API_ERROR_RULES.deckNotFound],
    ),
  );
}
