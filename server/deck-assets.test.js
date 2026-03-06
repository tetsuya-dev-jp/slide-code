import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import { DeckStorage } from './deck-storage.js';

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

    test('reports missing asset deletion as not found', () => {
        const storage = createStorageWithDeck();
        expect(() => storage.deleteAsset('demo', 'missing.png')).toThrow('asset-not-found');
    });
});
