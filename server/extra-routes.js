import { createDeckExportHtml, createDeckExportZip } from './export-service.js';
import { API_ERROR_RULES, createApiError, withApiErrorHandling } from './api-errors.js';
import {
  createDeckFromTemplate,
  listTemplates,
  removeTemplatesFromDeck,
  saveTemplateFromDeck,
} from './template-service.js';

function isNotFoundError(err) {
  return (
    err?.code === 'ENOENT' ||
    err?.message === 'deck-not-found' ||
    err?.message === 'asset-not-found'
  );
}

function asQueryString(value) {
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
}

function asBooleanFlag(value) {
  const normalized = asQueryString(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function headerSafeFilename(value, fallback = 'asset.bin') {
  const compact = String(value || '')
    .trim()
    .replace(/[\r\n]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_');
  return compact || fallback;
}

function headerAsciiFilename(value, fallback = 'download.bin') {
  const compact = headerSafeFilename(value, fallback).replace(/[^\x20-\x7E]/g, '_');
  return compact || fallback;
}

function encodeHeaderFilename(value) {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function createContentDisposition(dispositionType, filename, fallback = 'download.bin') {
  const safeFilename = headerSafeFilename(filename, fallback);
  const asciiFilename = headerAsciiFilename(safeFilename, fallback);
  const encodedFilename = encodeHeaderFilename(safeFilename);
  return `${dispositionType}; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;
}

function shouldServeAssetInline(asset) {
  const mimeType = typeof asset?.mimeType === 'string' ? asset.mimeType.toLowerCase() : '';
  if (!mimeType) return false;
  if (mimeType === 'image/svg+xml') return false;
  if (mimeType.startsWith('image/')) return true;
  return mimeType === 'application/pdf' || mimeType === 'text/plain';
}

const CREATE_DECK_FROM_TEMPLATE_ERROR_RULES = [
  {
    status: 400,
    error: 'Invalid template request',
    match: (err) =>
      err?.message === 'invalid-deck-id' ||
      err?.code === 'EINVAL' ||
      err?.message === 'missing-template-id',
  },
  API_ERROR_RULES.deckAlreadyExists,
  {
    status: 404,
    error: 'Template not found',
    match: (err) => isNotFoundError(err) || err?.message === 'template-source-not-found',
  },
  API_ERROR_RULES.unsupportedDeckSchema,
];

const SAVE_TEMPLATE_FROM_DECK_ERROR_RULES = [
  API_ERROR_RULES.invalidDeckId,
  API_ERROR_RULES.templateAlreadyExists,
  {
    status: 404,
    error: 'Deck not found',
    match: isNotFoundError,
  },
  API_ERROR_RULES.unsupportedDeckSchema,
];

const DELETE_TEMPLATE_ERROR_RULES = [
  API_ERROR_RULES.invalidDeckId,
  API_ERROR_RULES.templateNotFound,
];

const DECK_ASSET_LIST_ERROR_RULES = [
  API_ERROR_RULES.invalidDeckId,
  {
    status: 404,
    error: 'Deck not found',
    match: isNotFoundError,
  },
  API_ERROR_RULES.unsupportedDeckSchema,
];

const UPSERT_ASSET_ERROR_RULES = [
  {
    status: 400,
    error: 'Invalid asset payload',
    match: (err) =>
      err?.message === 'invalid-deck-id' ||
      err?.code === 'EINVAL' ||
      err?.message === 'invalid-asset-content' ||
      err?.message === 'asset-too-large' ||
      err?.message === 'unsupported-asset-type',
  },
  {
    status: 404,
    error: 'Deck not found',
    match: isNotFoundError,
  },
  API_ERROR_RULES.unsupportedDeckSchema,
];

const DELETE_ASSET_ERROR_RULES = [
  API_ERROR_RULES.invalidDeckId,
  {
    status: 404,
    error: 'Deck or asset not found',
    match: isNotFoundError,
  },
  API_ERROR_RULES.unsupportedDeckSchema,
];

const READ_ASSET_FILE_ERROR_RULES = [
  API_ERROR_RULES.invalidDeckId,
  {
    status: 404,
    error: 'Asset not found',
    match: isNotFoundError,
  },
  API_ERROR_RULES.unsupportedDeckSchema,
];

const EXPORT_DECK_ERROR_RULES = [
  API_ERROR_RULES.invalidDeckId,
  {
    status: 404,
    error: 'Deck not found',
    match: isNotFoundError,
  },
  API_ERROR_RULES.unsupportedDeckSchema,
];

export function registerExtraRoutes(app, getContext) {
  app.get(
    '/api/templates',
    withApiErrorHandling((_req, res) => {
      const { templateStorage, sharedTemplateStorage } = getContext();
      res.json(
        listTemplates({
          localTemplateStorage: templateStorage,
          sharedTemplateStorage,
        }),
      );
    }),
  );

  app.post(
    '/api/decks/from-template',
    withApiErrorHandling((req, res) => {
      const { storage, templateStorage, sharedTemplateStorage } = getContext();
      const created = createDeckFromTemplate({
        deckStorage: storage,
        localTemplateStorage: templateStorage,
        sharedTemplateStorage,
        payload: req.body,
      });
      res.status(201).json(created);
    }, CREATE_DECK_FROM_TEMPLATE_ERROR_RULES),
  );

  app.post(
    '/api/templates/from-deck/:id',
    withApiErrorHandling((req, res) => {
      const { storage, templateStorage } = getContext();
      const templateMeta = saveTemplateFromDeck({
        deckStorage: storage,
        localTemplateStorage: templateStorage,
        deckId: req.params.id,
        payload: req.body,
      });
      res.status(201).json(templateMeta);
    }, SAVE_TEMPLATE_FROM_DECK_ERROR_RULES),
  );

  app.delete(
    '/api/templates/from-deck/:id',
    withApiErrorHandling((req, res) => {
      const { templateStorage } = getContext();
      const result = removeTemplatesFromDeck({
        localTemplateStorage: templateStorage,
        deckId: req.params.id,
      });
      res.json({ ok: true, ...result });
    }, DELETE_TEMPLATE_ERROR_RULES),
  );

  app.get(
    '/api/decks/:id/assets',
    withApiErrorHandling((req, res) => {
      const { storage } = getContext();
      const assets = storage.listDeckAssets(req.params.id);
      res.json({ assets });
    }, DECK_ASSET_LIST_ERROR_RULES),
  );

  app.post(
    '/api/decks/:id/assets',
    withApiErrorHandling((req, res) => {
      const { storage } = getContext();
      const asset = storage.upsertAsset(req.params.id, req.body);
      const assets = storage.listDeckAssets(req.params.id);
      res.status(201).json({ asset, assets });
    }, UPSERT_ASSET_ERROR_RULES),
  );

  app.delete(
    '/api/decks/:id/assets',
    withApiErrorHandling((req, res) => {
      const requestedPath = asQueryString(req.query.path);
      if (!requestedPath) {
        throw createApiError(400, 'Missing asset path');
      }

      const { storage } = getContext();
      storage.deleteAsset(req.params.id, requestedPath);
      const assets = storage.listDeckAssets(req.params.id);
      res.json({ ok: true, assets });
    }, DELETE_ASSET_ERROR_RULES),
  );

  app.get(
    '/api/decks/:id/assets/file',
    withApiErrorHandling((req, res) => {
      const requestedPath = asQueryString(req.query.path);
      if (!requestedPath) {
        throw createApiError(400, 'Missing asset path');
      }

      const { storage } = getContext();
      const asset = storage.readAsset(req.params.id, requestedPath);
      const forceDownload = asBooleanFlag(req.query.download);
      const dispositionType =
        forceDownload || !shouldServeAssetInline(asset) ? 'attachment' : 'inline';
      res.setHeader('Content-Type', asset.mimeType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      res.setHeader(
        'Content-Disposition',
        createContentDisposition(dispositionType, asset.path, 'asset.bin'),
      );
      if (asset.mimeType === 'image/svg+xml') {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
        );
      }
      res.send(asset.buffer);
    }, READ_ASSET_FILE_ERROR_RULES),
  );

  app.get(
    '/api/decks/:id/export/:format',
    withApiErrorHandling((req, res) => {
      const format = typeof req.params.format === 'string' ? req.params.format.toLowerCase() : '';

      const { storage } = getContext();
      if (format === 'html') {
        const result = createDeckExportHtml({
          storage,
          deckId: req.params.id,
          printMode: false,
        });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          createContentDisposition('attachment', result.filename, 'deck.html'),
        );
        return res.send(result.html);
      }

      if (format === 'print') {
        const result = createDeckExportHtml({
          storage,
          deckId: req.params.id,
          printMode: true,
        });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', 'inline');
        return res.send(result.html);
      }

      if (format === 'pdf') {
        throw createApiError(400, 'PDF export is not supported; use print export');
      }

      if (format === 'zip') {
        const result = createDeckExportZip({
          storage,
          deckId: req.params.id,
        });
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader(
          'Content-Disposition',
          createContentDisposition('attachment', result.filename, 'deck.zip'),
        );
        return res.send(result.buffer);
      }

      throw createApiError(400, 'Unsupported export format');
    }, EXPORT_DECK_ERROR_RULES),
  );
}
