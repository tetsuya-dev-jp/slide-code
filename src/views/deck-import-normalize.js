import {
  createDefaultFile,
  createDefaultSlide,
  normalizeHighlightLines,
  normalizeLineRange,
  resolveDeckFile,
} from '../core/deck-utils.js';

export function normalizeImportedDeck(data, filename) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('invalid-deck');
  }

  const fallbackTitle = filename.replace(/\.json$/i, '') || 'インポートしたデッキ';
  const title =
    typeof data.title === 'string' && data.title.trim() ? data.title.trim() : fallbackTitle;
  const description = typeof data.description === 'string' ? data.description : '';
  const terminalCwd = typeof data.terminal?.cwd === 'string' ? data.terminal.cwd.trim() : '';

  const normalizedFiles = Array.isArray(data.files)
    ? data.files
        .filter((file) => file && typeof file === 'object')
        .map((file, index) => {
          const fallbackFile = createDefaultFile(index);
          return {
            id: typeof file.id === 'string' && file.id.trim() ? file.id.trim() : fallbackFile.id,
            name:
              typeof file.name === 'string' && file.name.trim()
                ? file.name.trim()
                : fallbackFile.name,
            language:
              typeof file.language === 'string' && file.language.trim()
                ? file.language.trim()
                : fallbackFile.language,
            code: typeof file.code === 'string' ? file.code : '',
          };
        })
    : [];

  if (normalizedFiles.length === 0) {
    normalizedFiles.push(createDefaultFile(0));
  }

  const fallbackFile = normalizedFiles[0];

  const normalizedSlides = Array.isArray(data.slides)
    ? data.slides
        .filter((slide) => slide && typeof slide === 'object')
        .map((slide, index) => {
          const explicitEmpty = slide.fileId === '' || slide.fileRef === '';
          const file = explicitEmpty
            ? null
            : resolveDeckFile(normalizedFiles, slide) || fallbackFile;
          const lineRange = file
            ? normalizeLineRange(slide.lineRange, (file.code || '').split('\n').length)
            : [1, 1];
          const highlightLines = file
            ? normalizeHighlightLines(slide.highlightLines, {
                minLine: lineRange[0],
                maxLine: lineRange[1],
              })
            : [];

          const fileId = file?.id || '';
          const fileRef = file?.name || '';

          return {
            title:
              typeof slide.title === 'string' && slide.title.trim()
                ? slide.title.trim()
                : createDefaultSlide(index, fileRef, fileId).title,
            fileId,
            fileRef,
            lineRange,
            highlightLines,
            markdown: typeof slide.markdown === 'string' ? slide.markdown : '',
          };
        })
    : [];

  if (normalizedSlides.length === 0) {
    normalizedSlides.push(createDefaultSlide(0, fallbackFile.name, fallbackFile.id));
  }

  const normalizedAssets = Array.isArray(data.assets)
    ? data.assets
        .filter((asset) => asset && typeof asset === 'object')
        .map((asset) => ({
          path: typeof asset.path === 'string' ? asset.path : '',
          mimeType:
            typeof asset.mimeType === 'string' ? asset.mimeType : 'application/octet-stream',
          kind: typeof asset.kind === 'string' ? asset.kind : 'file',
          size: Number.isFinite(parseInt(asset.size, 10)) ? parseInt(asset.size, 10) : 0,
        }))
    : [];

  return {
    schemaVersion: 2,
    title,
    description,
    files: normalizedFiles,
    slides: normalizedSlides,
    assets: normalizedAssets,
    terminal: {
      cwd: terminalCwd,
    },
  };
}
