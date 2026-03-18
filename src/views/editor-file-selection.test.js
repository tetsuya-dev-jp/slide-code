import { describe, expect, test } from 'vitest';
import { isFileAlreadyLoaded } from './editor-file-selection.js';

describe('isFileAlreadyLoaded', () => {
  test('returns true when the requested file is already rendered in monaco', () => {
    expect(
      isFileAlreadyLoaded({
        currentFile: { id: 'file-1', code: 'print(1)\n' },
        requestedFileId: 'file-1',
        editorValue: 'print(1)\n',
      }),
    ).toBe(true);
  });

  test('returns false when monaco is still empty during initial load', () => {
    expect(
      isFileAlreadyLoaded({
        currentFile: { id: 'file-1', code: 'for i in range(3):\n    print(i)\n' },
        requestedFileId: 'file-1',
        editorValue: '',
      }),
    ).toBe(false);
  });

  test('returns false when a different file is requested', () => {
    expect(
      isFileAlreadyLoaded({
        currentFile: { id: 'file-1', code: 'print(1)' },
        requestedFileId: 'file-2',
        editorValue: 'print(1)',
      }),
    ).toBe(false);
  });
});
