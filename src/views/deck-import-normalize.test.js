import { describe, expect, test } from 'vitest';
import { normalizeImportedDeck } from './deck-import-normalize.js';

describe('normalizeImportedDeck', () => {
  test('creates sane defaults for sparse payloads', () => {
    const deck = normalizeImportedDeck({}, 'demo.json');

    expect(deck.title).toBe('demo');
    expect(deck.files).toHaveLength(1);
    expect(deck.files[0].id).toMatch(/^file-/);
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0].fileId).toBe(deck.files[0].id);
    expect(deck.slides[0].fileRef).toBe(deck.files[0].name);
    expect(deck.terminal).toEqual({ cwd: '' });
  });

  test('normalizes slide refs and highlight lines', () => {
    const deck = normalizeImportedDeck(
      {
        files: [{ name: 'main.py', language: 'python', code: 'a\nb' }],
        slides: [
          {
            title: '',
            fileRef: 'missing.py',
            lineRange: [0, 9],
            highlightLines: [0, 1, 2, 3],
          },
        ],
      },
      'slides.json',
    );

    expect(deck.slides[0]).toEqual({
      title: 'スライド 1',
      fileId: deck.files[0].id,
      fileRef: 'main.py',
      lineRange: [1, 2],
      highlightLines: [1, 2],
      markdown: '',
    });
  });

  test('preserves explicit empty file refs for markdown-only slides', () => {
    const deck = normalizeImportedDeck(
      {
        files: [{ name: 'main.py', language: 'python', code: 'a\nb' }],
        slides: [
          {
            fileRef: '',
            lineRange: [4, 9],
            highlightLines: [1, 2],
            markdown: '解説だけ',
          },
        ],
      },
      'slides.json',
    );

    expect(deck.slides[0]).toEqual({
      title: 'スライド 1',
      fileId: '',
      fileRef: '',
      lineRange: [1, 1],
      highlightLines: [],
      markdown: '解説だけ',
    });
  });

  test('preserves explicit file ids when provided', () => {
    const deck = normalizeImportedDeck(
      {
        files: [{ id: 'file-custom', name: 'main.py', language: 'python', code: 'a' }],
        slides: [{ fileId: 'file-custom', lineRange: [1, 1], highlightLines: [] }],
      },
      'ids.json',
    );

    expect(deck.files[0].id).toBe('file-custom');
    expect(deck.slides[0].fileId).toBe('file-custom');
    expect(deck.slides[0].fileRef).toBe('main.py');
  });

  test('rejects non-object payloads', () => {
    expect(() => normalizeImportedDeck([], 'bad.json')).toThrow('invalid-deck');
  });
});
