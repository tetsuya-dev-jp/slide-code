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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slidecode-storage-ops-'));
    tempDirs.push(dir);
    return dir;
}

describe('DeckStorage quarantine', () => {
    test('quarantines invalid deck manifests instead of deleting them', () => {
        const rootDir = createTempDir();
        const decksDir = path.join(rootDir, 'decks');
        const quarantineDir = path.join(rootDir, 'quarantine');
        const invalidDeckDir = path.join(decksDir, 'broken-deck');
        fs.mkdirSync(invalidDeckDir, { recursive: true });
        fs.writeFileSync(path.join(invalidDeckDir, 'deck.json'), '{not-json', 'utf-8');

        const storage = new DeckStorage(decksDir);
        const quarantined = storage.quarantineInvalidDecks(quarantineDir);

        expect(quarantined).toHaveLength(1);
        expect(quarantined[0].deckId).toBe('broken-deck');
        expect(fs.existsSync(invalidDeckDir)).toBe(false);
        expect(fs.existsSync(path.join(quarantined[0].targetDir, 'deck.json'))).toBe(true);
        expect(fs.existsSync(path.join(quarantined[0].targetDir, 'quarantine.json'))).toBe(true);
    });
});
