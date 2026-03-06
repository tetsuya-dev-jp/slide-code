import fs from 'fs';
import path from 'path';
import {
    normalizeAssetPath,
    normalizeNonEmptyString,
    normalizeString,
    resolvePathInsideRoot,
} from './deck-normalize.js';
import { replaceDirectoryAtomic } from './fs-atomic.js';

const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const ALLOWED_ASSET_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/avif',
    'application/pdf',
    'text/plain',
    'application/json',
]);

function guessMimeTypeFromPath(assetPath) {
    const ext = path.extname(assetPath).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.avif') return 'image/avif';
    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.txt') return 'text/plain';
    if (ext === '.json') return 'application/json';
    return 'application/octet-stream';
}

function copyDirectoryRecursive(sourceDir, targetDir) {
    if (!fs.existsSync(sourceDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        return;
    }

    if (typeof fs.cpSync === 'function') {
        fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
        return;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
    entries.forEach((entry) => {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDirectoryRecursive(sourcePath, targetPath);
            return;
        }
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(sourcePath, targetPath);
    });
}

export function copyDeckAssetsDirectory(storage, sourceDeckId, targetDeckId) {
    const sourceAssetsDir = storage.getDeckAssetsDir(sourceDeckId);
    const targetAssetsDir = storage.getDeckAssetsDir(targetDeckId);
    replaceDirectoryAtomic(targetAssetsDir, (tempDir) => {
        copyDirectoryRecursive(sourceAssetsDir, tempDir);
    });
}

export function copyDeckAssetsFromStorage(storage, sourceStorage, sourceDeckId, targetDeckId) {
    const sourceAssetsDir = sourceStorage.getDeckAssetsDir(sourceDeckId);
    const targetAssetsDir = storage.getDeckAssetsDir(targetDeckId);
    replaceDirectoryAtomic(targetAssetsDir, (tempDir) => {
        copyDirectoryRecursive(sourceAssetsDir, tempDir);
    });
}

function isAllowedAssetMimeType(mimeType) {
    return ALLOWED_ASSET_MIME_TYPES.has(mimeType);
}

function normalizeAssetMimeType(inputMimeType, assetPath) {
    return normalizeNonEmptyString(inputMimeType, guessMimeTypeFromPath(assetPath)).toLowerCase();
}

function assertSupportedAsset(assetPath, mimeType, buffer) {
    if (buffer.length === 0) {
        const err = new Error('invalid-asset-content');
        err.code = 'EINVAL';
        throw err;
    }

    if (buffer.length > MAX_ASSET_BYTES) {
        const err = new Error('asset-too-large');
        err.code = 'EINVAL';
        throw err;
    }

    if (!isAllowedAssetMimeType(mimeType)) {
        const err = new Error('unsupported-asset-type');
        err.code = 'EINVAL';
        throw err;
    }

    if (path.extname(assetPath).toLowerCase() === '.svg' || mimeType === 'image/svg+xml') {
        const err = new Error('unsupported-asset-type');
        err.code = 'EINVAL';
        throw err;
    }
}

export function resolveUniqueDeckAssetPath(storage, deckId, requestedPath) {
    const normalized = normalizeAssetPath(requestedPath, 'asset.bin');
    const assetsDir = storage.getDeckAssetsDir(deckId);
    const ext = path.posix.extname(normalized);
    const stem = ext ? normalized.slice(0, -ext.length) : normalized;

    let candidate = normalized;
    let index = 2;
    while (true) {
        const absolute = resolvePathInsideRoot(assetsDir, candidate);
        if (!fs.existsSync(absolute)) return candidate;
        candidate = `${stem}-${index}${ext}`;
        index += 1;
    }
}

export function upsertDeckAsset(storage, deckId, payload = {}) {
    const existing = storage.readDeck(deckId);
    const input = payload && typeof payload === 'object' ? payload : {};
    const sourcePath = typeof input.path === 'string' ? input.path : (input.name || 'asset.bin');
    const assetPath = resolveUniqueDeckAssetPath(storage, deckId, sourcePath);

    const buffer = Buffer.isBuffer(input.buffer)
        ? input.buffer
        : Buffer.from(normalizeString(input.contentBase64, ''), 'base64');
    const mimeType = normalizeAssetMimeType(input.mimeType, assetPath);
    assertSupportedAsset(assetPath, mimeType, buffer);

    const absolutePath = storage.getAssetAbsolutePath(deckId, assetPath);
    const kind = normalizeNonEmptyString(input.kind, mimeType.startsWith('image/') ? 'image' : 'file');
    const size = buffer.length;

    const persistedAssets = (existing.assets || [])
        .filter(asset => asset.path !== assetPath)
        .map(({ exists: _exists, ...asset }) => asset);
    persistedAssets.push({ path: assetPath, mimeType, kind, size });

    let persisted = false;

    try {
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, buffer);

        storage.writeDeck({
            ...existing,
            assets: persistedAssets,
            updatedAt: new Date().toISOString(),
        });
        persisted = true;
    } finally {
        if (!persisted) {
            fs.rmSync(absolutePath, { force: true });
        }
    }

    return { path: assetPath, mimeType, kind, size, exists: true };
}

export function readDeckAsset(storage, deckId, assetPath) {
    const deck = storage.readDeck(deckId);
    const normalizedPath = normalizeAssetPath(assetPath, 'asset.bin');
    const absolutePath = storage.getAssetAbsolutePath(deckId, normalizedPath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
        const err = new Error('asset-not-found');
        err.code = 'ENOENT';
        throw err;
    }

    const manifestAsset = (deck.assets || []).find(asset => asset.path === normalizedPath);
    return {
        path: normalizedPath,
        buffer: fs.readFileSync(absolutePath),
        mimeType: manifestAsset?.mimeType || guessMimeTypeFromPath(normalizedPath),
        kind: manifestAsset?.kind || 'file',
    };
}

export function deleteDeckAsset(storage, deckId, assetPath) {
    const deck = storage.readDeck(deckId);
    const normalizedPath = normalizeAssetPath(assetPath, 'asset.bin');
    const absolutePath = storage.getAssetAbsolutePath(deckId, normalizedPath);
    const existedInManifest = (deck.assets || []).some(asset => asset.path === normalizedPath);
    const existedOnDisk = fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();

    if (!existedInManifest && !existedOnDisk) {
        const err = new Error('asset-not-found');
        err.code = 'ENOENT';
        throw err;
    }

    const backupPath = existedOnDisk
        ? path.join(storage.getDeckDir(deckId), `.asset-delete-${Date.now()}-${path.basename(normalizedPath)}`)
        : '';

    if (existedOnDisk) {
        fs.mkdirSync(path.dirname(backupPath), { recursive: true });
        fs.renameSync(absolutePath, backupPath);
    }

    const nextAssets = (deck.assets || [])
        .filter(asset => asset.path !== normalizedPath)
        .map(({ exists: _exists, ...asset }) => asset);

    let persisted = false;

    try {
        storage.writeDeck({
            ...deck,
            assets: nextAssets,
            updatedAt: new Date().toISOString(),
        });
        persisted = true;
    } finally {
        if (persisted) {
            if (backupPath) {
                fs.rmSync(backupPath, { force: true });
            }
        } else if (backupPath && fs.existsSync(backupPath) && !fs.existsSync(absolutePath)) {
            fs.renameSync(backupPath, absolutePath);
        }
    }
}
