import { describe, expect, test } from 'vitest';
import { getEditorFileValidationState } from './editor-file-validation.js';

describe('getEditorFileValidationState', () => {
  test('does not require a file name when no code file is selected', () => {
    expect(getEditorFileValidationState({
      currentFile: null,
      rawName: '',
      files: [{ id: 'file-1', name: 'main.py' }],
    })).toEqual({
      message: '',
      normalizedName: '',
    });
  });

  test('validates the current file name when a code file is selected', () => {
    expect(getEditorFileValidationState({
      currentFile: { id: 'file-1', name: 'main.py' },
      rawName: '',
      files: [{ id: 'file-1', name: 'main.py' }],
    })).toEqual({
      message: 'ファイル名を入力してください',
      normalizedName: 'main.py',
    });
  });
});
