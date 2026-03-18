import { describe, expect, test } from 'vitest';
import { resolveSlideCode } from './resolve-code.js';

describe('resolveSlideCode', () => {
  test('returns sliced code and relative highlight lines', () => {
    const deck = {
      files: [
        {
          id: 'file-main',
          name: 'main.py',
          language: 'python',
          code: 'one\ntwo\nthree\nfour',
        },
      ],
    };
    const slide = {
      fileId: 'file-main',
      fileRef: 'renamed.py',
      lineRange: [2, 4],
      highlightLines: [1, 2, 4],
    };

    expect(resolveSlideCode(slide, deck)).toEqual({
      code: 'two\nthree\nfour',
      language: 'python',
      highlightLines: [1, 3],
    });
  });

  test('falls back when referenced file is missing', () => {
    expect(resolveSlideCode({ fileRef: 'missing.py' }, { files: [] })).toEqual({
      code: '',
      language: 'python',
      highlightLines: [],
    });
  });

  test('falls back to legacy fileRef when fileId is missing', () => {
    expect(
      resolveSlideCode(
        { fileRef: 'main.py' },
        {
          files: [{ id: 'file-1', name: 'main.py', language: 'python', code: 'one' }],
        },
      ),
    ).toEqual({
      code: 'one',
      language: 'python',
      highlightLines: [],
    });
  });
});
