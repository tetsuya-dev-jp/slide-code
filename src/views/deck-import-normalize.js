export function normalizeImportedDeck(data, filename) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('invalid-deck');
  }

  const fallbackTitle = filename.replace(/\.json$/i, '') || 'インポートしたデッキ';
  const title = typeof data.title === 'string' && data.title.trim()
    ? data.title.trim()
    : fallbackTitle;
  const description = typeof data.description === 'string' ? data.description : '';
  const terminalCwd = typeof data.terminal?.cwd === 'string'
    ? data.terminal.cwd.trim()
    : '';

  const normalizedFiles = Array.isArray(data.files)
    ? data.files
      .filter(file => file && typeof file === 'object')
      .map((file, index) => {
        const fallbackName = index === 0 ? 'main.py' : `file${index + 1}.txt`;
        return {
          name: typeof file.name === 'string' && file.name.trim() ? file.name.trim() : fallbackName,
          language: typeof file.language === 'string' && file.language.trim() ? file.language.trim() : 'plaintext',
          code: typeof file.code === 'string' ? file.code : '',
        };
      })
    : [];

  if (normalizedFiles.length === 0) {
    normalizedFiles.push({ name: 'main.py', language: 'python', code: '' });
  }

  const fileNames = new Set(normalizedFiles.map(file => file.name));
  const fallbackFileRef = normalizedFiles[0].name;

  const normalizeLineRange = (lineRange) => {
    let start = parseInt(Array.isArray(lineRange) ? lineRange[0] : undefined, 10);
    let end = parseInt(Array.isArray(lineRange) ? lineRange[1] : undefined, 10);
    if (!Number.isFinite(start) || start < 1) start = 1;
    if (!Number.isFinite(end) || end < start) end = start;
    return [start, end];
  };

  const normalizedSlides = Array.isArray(data.slides)
    ? data.slides
      .filter(slide => slide && typeof slide === 'object')
      .map((slide, index) => {
        const fileRef = typeof slide.fileRef === 'string' && fileNames.has(slide.fileRef)
          ? slide.fileRef
          : fallbackFileRef;
        const lineRange = normalizeLineRange(slide.lineRange);
        const highlightLines = Array.isArray(slide.highlightLines)
          ? slide.highlightLines
            .map(line => parseInt(line, 10))
            .filter(line => Number.isFinite(line) && line >= lineRange[0] && line <= lineRange[1])
          : [];

        return {
          title: typeof slide.title === 'string' && slide.title.trim() ? slide.title.trim() : `スライド ${index + 1}`,
          fileRef,
          lineRange,
          highlightLines,
          markdown: typeof slide.markdown === 'string' ? slide.markdown : '',
        };
      })
    : [];

  if (normalizedSlides.length === 0) {
    normalizedSlides.push({
      title: 'スライド 1',
      fileRef: fallbackFileRef,
      lineRange: [1, 1],
      highlightLines: [],
      markdown: '',
    });
  }

  const normalizedAssets = Array.isArray(data.assets)
    ? data.assets
      .filter(asset => asset && typeof asset === 'object')
      .map((asset) => ({
        path: typeof asset.path === 'string' ? asset.path : '',
        mimeType: typeof asset.mimeType === 'string' ? asset.mimeType : 'application/octet-stream',
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
