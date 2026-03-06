import { describe, expect, test } from 'vitest';
import { normalizeDeckPayload } from './deck-normalize.js';

describe('normalizeDeckPayload', () => {
  test('assigns stable file ids and resolves slides from legacy file refs', () => {
    const deck = normalizeDeckPayload({
      files: [{ name: 'main.py', language: 'python', code: 'a\nb' }],
      slides: [{ fileRef: 'main.py', lineRange: [1, 2], highlightLines: [2] }],
    });

    expect(deck.files[0].id).toMatch(/^file-/);
    expect(deck.slides[0]).toEqual({
      title: 'スライド 1',
      fileId: deck.files[0].id,
      fileRef: 'main.py',
      lineRange: [1, 2],
      highlightLines: [2],
      markdown: '',
    });
  });

  test('preserves explicit empty file refs for markdown-only slides', () => {
    const deck = normalizeDeckPayload({
      files: [{ name: 'main.py', language: 'python', code: 'a\nb' }],
      slides: [{
        fileRef: '',
        lineRange: [4, 9],
        highlightLines: [1, 2],
        markdown: '解説だけ',
      }],
    });

    expect(deck.slides[0]).toEqual({
      title: 'スライド 1',
      fileId: '',
      fileRef: '',
      lineRange: [1, 1],
      highlightLines: [],
      markdown: '解説だけ',
    });
  });
});
