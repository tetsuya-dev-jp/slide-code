import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import { replaceDirectoryAtomic, writeFileAtomic } from './fs-atomic.js';

const tempDirs = [];

afterEach(() => {
    while (tempDirs.length) {
        fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
    }
});

function createTempDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slidecode-atomic-'));
    tempDirs.push(dir);
    return dir;
}

describe('fs-atomic', () => {
    test('writeFileAtomic persists file contents', () => {
        const dir = createTempDir();
        const filePath = path.join(dir, 'config.json');

        writeFileAtomic(filePath, '{"ok":true}\n', 'utf-8');

        expect(fs.readFileSync(filePath, 'utf-8')).toBe('{"ok":true}\n');
    });

    test('replaceDirectoryAtomic swaps directory contents without leaving partial output', () => {
        const dir = createTempDir();
        const targetDir = path.join(dir, 'deck');
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(path.join(targetDir, 'old.txt'), 'old', 'utf-8');

        replaceDirectoryAtomic(targetDir, (tempDir) => {
            fs.mkdirSync(tempDir, { recursive: true });
            fs.writeFileSync(path.join(tempDir, 'new.txt'), 'new', 'utf-8');
        });

        expect(fs.existsSync(path.join(targetDir, 'old.txt'))).toBe(false);
        expect(fs.readFileSync(path.join(targetDir, 'new.txt'), 'utf-8')).toBe('new');
    });
});
