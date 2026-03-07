import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import { DeckStorage } from './deck-storage.js';
import { inferAssetKind } from './deck-assets.js';

const tempDirs = [];

afterEach(() => {
    while (tempDirs.length) {
        fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
    }
});

function createTempDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slidecode-assets-'));
    tempDirs.push(dir);
    return dir;
}

function createStorageWithDeck() {
    const rootDir = createTempDir();
    const storage = new DeckStorage(path.join(rootDir, 'decks'));
    storage.ensureReady();
    storage.createDeckWithId('demo', {
        title: 'Demo',
        files: [{ name: 'main.py', language: 'python', code: 'print(1)' }],
        slides: [{ title: 'Slide 1', fileRef: 'main.py', lineRange: [1, 1], highlightLines: [], markdown: '' }],
    });
    return storage;
}

describe('deck-assets hardening', () => {
    test('infers non-image asset kinds from mime type', () => {
        expect(inferAssetKind('image/png')).toBe('image');
        expect(inferAssetKind('application/pdf')).toBe('document');
        expect(inferAssetKind('text/plain')).toBe('text');
        expect(inferAssetKind('application/json')).toBe('data');
        expect(inferAssetKind('application/octet-stream')).toBe('file');
    });

    test('rejects svg uploads', () => {
        const storage = createStorageWithDeck();

        expect(() => {
            storage.upsertAsset('demo', {
                name: 'overview.svg',
                mimeType: 'image/svg+xml',
                contentBase64: Buffer.from('<svg />', 'utf-8').toString('base64'),
            });
        }).toThrow('unsupported-asset-type');
    });

    test('stores inferred kind for uploaded non-image assets', () => {
        const storage = createStorageWithDeck();

        const asset = storage.upsertAsset('demo', {
            name: 'data.json',
            mimeType: 'application/json',
            contentBase64: Buffer.from('{"ok":true}', 'utf-8').toString('base64'),
            kind: 'image',
        });

        expect(asset).toMatchObject({
            path: 'data.json',
            mimeType: 'application/json',
            kind: 'data',
            exists: true,
        });
        expect(storage.listDeckAssets('demo')).toEqual([
            expect.objectContaining({
                path: 'data.json',
                mimeType: 'application/json',
                kind: 'data',
                exists: true,
            }),
        ]);
    });

    test('reports missing asset deletion as not found', () => {
        const storage = createStorageWithDeck();
        expect(() => storage.deleteAsset('demo', 'missing.png')).toThrow('asset-not-found');
    });
});
