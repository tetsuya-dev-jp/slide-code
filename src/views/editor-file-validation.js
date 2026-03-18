import { sanitizeRelativeFilePath, validateRelativeFilePath } from '../core/deck-utils.js';

export function getEditorFileValidationState({ currentFile, rawName = '', files = [] } = {}) {
  if (!currentFile) {
    return {
      message: '',
      normalizedName: '',
    };
  }

  return {
    message: validateRelativeFilePath(rawName, files, currentFile.id || ''),
    normalizedName: sanitizeRelativeFilePath(rawName, currentFile.name || 'file.txt'),
  };
}
