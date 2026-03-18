export function isFileAlreadyLoaded({ currentFile, requestedFileId, editorValue } = {}) {
  if (!currentFile || typeof requestedFileId !== 'string' || !requestedFileId) {
    return false;
  }

  if (currentFile.id !== requestedFileId) {
    return false;
  }

  return editorValue === (currentFile.code || '');
}
