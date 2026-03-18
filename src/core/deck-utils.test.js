import { describe, expect, test } from 'vitest';
import {
  compactLineGroups,
  ensureDeckShape,
  normalizeDraftSlideState,
  normalizeHighlightLines,
  normalizeLineRange,
  normalizeRelativeDirectory,
  parseHighlightLinesInput,
  resolveDeckFile,
  resolveUniqueFilePath,
  sanitizeRelativeFilePath,
  validateRelativeFilePath,
} from './deck-utils.js';

describe('deck-utils', () => {
  test('normalizeLineRange clamps invalid values into file bounds', () => {
    expect(normalizeLineRange([0, 99], 5)).toEqual([1, 5]);
    expect(normalizeLineRange(['3', '1'], 10)).toEqual([3, 3]);
  });

  test('normalizeHighlightLines removes duplicates and out-of-range values', () => {
    expect(normalizeHighlightLines([5, '2', 5, 0, 'x'], { minLine: 1, maxLine: 4 })).toEqual([2]);
  });

  test('parseHighlightLinesInput parses comma-separated values', () => {
    expect(parseHighlightLinesInput('4, 1, 4, x, 2')).toEqual([1, 2, 4]);
  });

  test('compactLineGroups merges consecutive lines', () => {
    expect(compactLineGroups([1, 2, 4, 6, 7, 8])).toEqual([
      { start: 1, end: 2 },
      { start: 4, end: 4 },
      { start: 6, end: 8 },
    ]);
  });

  test('normalizeDraftSlideState resolves target file and clamps range', () => {
    const result = normalizeDraftSlideState(
      {
        fileId: 'file-main',
        lineRange: [2, 9],
        highlightLines: [1, 3, 3, 5],
      },
      [{ id: 'file-main', name: 'main.py', code: 'a\nb\nc', language: 'python' }],
    );

    expect(result?.targetFile.id).toBe('file-main');
    expect(result?.targetFile.name).toBe('main.py');
    expect(result?.normalized.lineRange).toEqual([2, 3]);
    expect(result?.normalized.highlightLines).toEqual([1, 3, 5]);
  });

  test('ensureDeckShape fills missing ids, slides, assets, and terminal', () => {
    const deck = ensureDeckShape({ title: 'demo' });

    expect(deck.files).toHaveLength(1);
    expect(deck.files[0].id).toMatch(/^file-/);
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0].fileId).toBe(deck.files[0].id);
    expect(deck.slides[0].fileRef).toBe(deck.files[0].name);
    expect(deck.assets).toEqual([]);
    expect(deck.terminal).toEqual({ cwd: '' });
  });

  test('resolveDeckFile falls back from fileId to legacy fileRef', () => {
    const files = [{ id: 'file-1', name: 'main.py', language: 'python', code: '' }];

    expect(resolveDeckFile(files, { fileId: 'file-1' })?.name).toBe('main.py');
    expect(resolveDeckFile(files, { fileRef: 'main.py' })?.id).toBe('file-1');
  });

  test('normalizeRelativeDirectory strips traversal and leading slashes', () => {
    expect(normalizeRelativeDirectory('/foo/./bar/../baz')).toBe('foo/bar/baz');
    expect(normalizeRelativeDirectory('')).toBe('');
  });

  test('validateRelativeFilePath rejects empty, invalid, and duplicate names', () => {
    const files = [{ id: 'file-1', name: 'main.py' }];

    expect(validateRelativeFilePath('', files, '')).toBe('ファイル名を入力してください');
    expect(validateRelativeFilePath('../secret.py', files, '')).toBe(
      'ファイル名に . や .. は使えません',
    );
    expect(validateRelativeFilePath('bad:name.py', files, '')).toBe(
      'ファイル名に使えない文字が含まれています',
    );
    expect(validateRelativeFilePath('main.py', files, '')).toBe('同名のファイルが既に存在します');
    expect(validateRelativeFilePath('main.py', files, 'file-1')).toBe('');
  });

  test('sanitizeRelativeFilePath and resolveUniqueFilePath keep names safe and unique', () => {
    const files = [{ id: 'file-1', name: 'src/main.py' }];

    expect(sanitizeRelativeFilePath('../src/bad:name.py', 'file.txt')).toBe('src/bad_name.py');
    expect(resolveUniqueFilePath('src/main.py', files, 'file.txt')).toBe('src/main-2.py');
  });
});
