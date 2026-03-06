export const DECK_FOLDER_PATTERN = /^[a-zA-Z0-9_-]+$/;

function createOpaqueId(prefix = 'id') {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureUniqueFileId(candidate, usedIds) {
  const normalized = typeof candidate === 'string' ? candidate.trim() : '';
  if (normalized && !usedIds.has(normalized)) {
    usedIds.add(normalized);
    return normalized;
  }

  let nextId = createOpaqueId('file');
  while (usedIds.has(nextId)) {
    nextId = createOpaqueId('file');
  }
  usedIds.add(nextId);
  return nextId;
}

export function resolveDeckFile(files, reference) {
  const normalizedFiles = Array.isArray(files) ? files : [];
  const requestedFileId = typeof reference?.fileId === 'string' ? reference.fileId.trim() : '';
  if (requestedFileId) {
    const byId = normalizedFiles.find(file => file.id === requestedFileId);
    if (byId) return byId;
  }

  const requestedFileRef = typeof reference?.fileRef === 'string' ? reference.fileRef.trim() : '';
  if (!requestedFileRef) return null;
  return normalizedFiles.find(file => file.name === requestedFileRef) || null;
}

export function syncSlideFileReference(slide, files, { fallbackToFirstFile = true } = {}) {
  const normalizedFiles = Array.isArray(files) ? files : [];
  const fallbackFile = fallbackToFirstFile ? normalizedFiles[0] || null : null;
  const explicitEmpty = slide?.fileId === '' || slide?.fileRef === '';
  const resolvedFile = resolveDeckFile(normalizedFiles, slide);
  const targetFile = explicitEmpty ? null : (resolvedFile || fallbackFile);

  return {
    targetFile,
    fileId: targetFile?.id || '',
    fileRef: targetFile?.name || '',
  };
}

export function normalizeDeckFolderName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, '-');
}

export function createDeckFolderSlug(seed) {
  const base = normalizeDeckFolderName(seed)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');

  if (base) return base;
  return `deck-${Date.now().toString(36)}`;
}

export function getFileLineCount(fileOrCode) {
  const code = typeof fileOrCode === 'string'
    ? fileOrCode
    : (typeof fileOrCode?.code === 'string' ? fileOrCode.code : '');
  return Math.max(code.split('\n').length, 1);
}

export function normalizeLineRange(lineRange, maxLine = 1) {
  const clampedMaxLine = Math.max(Number(maxLine) || 1, 1);
  let start = parseInt(Array.isArray(lineRange) ? lineRange[0] : undefined, 10);
  let end = parseInt(Array.isArray(lineRange) ? lineRange[1] : undefined, 10);

  if (!Number.isFinite(start) || start < 1) start = 1;
  if (!Number.isFinite(end) || end < start) end = start;

  start = Math.min(start, clampedMaxLine);
  end = Math.min(end, clampedMaxLine);

  return [start, end];
}

export function normalizeHighlightLines(lines, { minLine = 1, maxLine = Infinity } = {}) {
  return Array.from(
    new Set((lines || [])
      .map(line => parseInt(line, 10))
      .filter(line => Number.isFinite(line) && line >= minLine && line <= maxLine)),
  ).sort((a, b) => a - b);
}

export function parseHighlightLinesInput(text) {
  if (!text) return [];
  return normalizeHighlightLines(text.split(','));
}

export function compactLineGroups(lines) {
  const normalizedLines = normalizeHighlightLines(lines);
  if (!normalizedLines.length) return [];

  const groups = [];
  let start = normalizedLines[0];
  let prev = normalizedLines[0];

  for (let i = 1; i < normalizedLines.length; i += 1) {
    const line = normalizedLines[i];
    if (line === prev + 1) {
      prev = line;
      continue;
    }

    groups.push({ start, end: prev });
    start = line;
    prev = line;
  }

  groups.push({ start, end: prev });
  return groups;
}

export function normalizeDraftSlideState(draft, files) {
  const normalizedFiles = Array.isArray(files) ? files : [];
  const targetFile = resolveDeckFile(normalizedFiles, draft);
  if (!targetFile) return null;

  const lineRange = normalizeLineRange(draft?.lineRange, getFileLineCount(targetFile));
  return {
    targetFile,
    normalized: {
      ...draft,
      fileId: targetFile.id,
      fileRef: targetFile.name,
      lineRange,
      highlightLines: normalizeHighlightLines(draft?.highlightLines),
    },
  };
}

export function createDefaultFile(index = 0) {
  if (index === 0) {
    return { id: createOpaqueId('file'), name: 'main.py', language: 'python', code: '' };
  }

  return { id: createOpaqueId('file'), name: `file${index + 1}.txt`, language: 'plaintext', code: '' };
}

export function createDefaultSlide(index = 0, fileRef = '', fileId = '') {
  return {
    title: `スライド ${index + 1}`,
    fileId,
    fileRef,
    lineRange: [1, 1],
    highlightLines: [],
    markdown: '',
  };
}

export function ensureDeckShape(deck) {
  if (!deck || typeof deck !== 'object') return deck;

  if (!Array.isArray(deck.files) || deck.files.length === 0) {
    deck.files = [createDefaultFile(0)];
  } else {
    const usedIds = new Set();
    deck.files = deck.files.map((file, index) => {
      const fallbackFile = createDefaultFile(index);
      return {
        ...fallbackFile,
        ...(file && typeof file === 'object' ? file : {}),
        id: ensureUniqueFileId(file?.id, usedIds),
      };
    });
  }

  if (!Array.isArray(deck.slides) || deck.slides.length === 0) {
    deck.slides = [createDefaultSlide(0, deck.files[0].name, deck.files[0].id)];
  } else {
    deck.slides = deck.slides.map((slide, index) => {
      const normalizedSlide = slide && typeof slide === 'object' ? slide : createDefaultSlide(index);
      const { fileId, fileRef } = syncSlideFileReference(normalizedSlide, deck.files);
      return {
        ...createDefaultSlide(index, fileRef, fileId),
        ...normalizedSlide,
        fileId,
        fileRef,
      };
    });
  }

  if (!Array.isArray(deck.assets)) {
    deck.assets = [];
  }

  if (!deck.terminal || typeof deck.terminal !== 'object') {
    deck.terminal = { cwd: '' };
  }

  if (typeof deck.terminal.cwd !== 'string') {
    deck.terminal.cwd = '';
  }

  return deck;
}

export function normalizeRelativeDirectory(rawValue) {
  if (typeof rawValue !== 'string') return '';
  const compact = rawValue.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!compact) return '';

  const segments = compact
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean)
    .filter(segment => segment !== '.' && segment !== '..');

  return segments.join('/');
}

export function formatRelativeDirectoryDisplay(relativePath) {
  const normalized = normalizeRelativeDirectory(relativePath);
  return normalized ? `~/${normalized}` : '~';
}
