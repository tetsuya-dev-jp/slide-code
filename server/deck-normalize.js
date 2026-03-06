import path from 'path';

export const DECK_SCHEMA_VERSION = 2;

export const DEFAULT_FILE = {
    name: 'main.py',
    language: 'python',
    code: '',
};

export function normalizeString(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

export function normalizeNonEmptyString(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
}

export function normalizeRelativePath(rawPath, fallbackPath) {
    const candidate = normalizeNonEmptyString(rawPath, fallbackPath).replace(/\\/g, '/');
    const normalizedSegments = candidate
        .split('/')
        .map(segment => segment.trim())
        .filter(Boolean)
        .filter(segment => segment !== '.' && segment !== '..')
        .map(segment => segment.replace(/[<>:"|?*\x00-\x1F]/g, '_'));

    if (normalizedSegments.length === 0) {
        return fallbackPath;
    }

    return normalizedSegments.join('/');
}

export function normalizeAssetPath(rawPath, fallbackPath = 'asset.bin') {
    return normalizeRelativePath(rawPath, fallbackPath);
}

function makeUniqueRelativePath(rawPath, usedNames, fallbackPath) {
    const normalized = normalizeRelativePath(rawPath, fallbackPath);
    if (!usedNames.has(normalized)) {
        usedNames.add(normalized);
        return normalized;
    }

    const ext = path.posix.extname(normalized);
    const dir = path.posix.dirname(normalized);
    const stem = ext ? normalized.slice(0, -ext.length) : normalized;
    const baseStem = path.posix.basename(stem) || 'file';
    const parent = dir === '.' ? '' : dir;

    let index = 2;
    while (true) {
        const candidateName = `${baseStem}-${index}${ext}`;
        const candidate = parent ? `${parent}/${candidateName}` : candidateName;
        if (!usedNames.has(candidate)) {
            usedNames.add(candidate);
            return candidate;
        }
        index += 1;
    }
}

export function inferLanguageFromFilename(filename) {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.py')) return 'python';
    if (lower.endsWith('.js')) return 'javascript';
    if (lower.endsWith('.ts')) return 'typescript';
    if (lower.endsWith('.sh')) return 'bash';
    if (lower.endsWith('.md')) return 'markdown';
    if (lower.endsWith('.json')) return 'json';
    return 'plaintext';
}

export function resolvePathInsideRoot(rootDir, relativePath) {
    const segments = normalizeRelativePath(relativePath, '').split('/').filter(Boolean);
    if (segments.length === 0) {
        throw new Error('invalid-path');
    }

    const resolved = path.resolve(rootDir, ...segments);
    const relative = path.relative(rootDir, resolved);
    const escapesRoot = relative.startsWith('..') || path.isAbsolute(relative);
    if (escapesRoot) {
        throw new Error('invalid-path');
    }
    return resolved;
}

function normalizeFiles(files) {
    const source = Array.isArray(files) ? files : [];
    const usedNames = new Set();
    const normalized = [];

    source.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object') return;

        const fallbackName = index === 0 ? DEFAULT_FILE.name : `file${index + 1}.txt`;
        const name = makeUniqueRelativePath(entry.name, usedNames, fallbackName);
        const language = normalizeNonEmptyString(entry.language, inferLanguageFromFilename(name));
        const code = normalizeString(entry.code, '');
        normalized.push({ name, language, code });
    });

    if (normalized.length === 0) {
        normalized.push({ ...DEFAULT_FILE });
    }

    return normalized;
}

function lineCountOfFile(file) {
    const code = normalizeString(file?.code, '');
    return Math.max(code.split('\n').length, 1);
}

function normalizeLineRange(lineRange, maxLine) {
    const max = Math.max(maxLine, 1);

    let start = Number.parseInt(Array.isArray(lineRange) ? lineRange[0] : undefined, 10);
    if (!Number.isFinite(start) || start < 1) start = 1;

    let end = Number.parseInt(Array.isArray(lineRange) ? lineRange[1] : undefined, 10);
    if (!Number.isFinite(end) || end < start) end = start;

    start = Math.min(start, max);
    end = Math.min(end, max);

    return [start, end];
}

function normalizeHighlightLines(highlightLines, start, end) {
    if (!Array.isArray(highlightLines)) return [];
    const values = new Set();

    highlightLines.forEach((value) => {
        const line = Number.parseInt(value, 10);
        if (!Number.isFinite(line)) return;
        if (line < start || line > end) return;
        values.add(line);
    });

    return Array.from(values).sort((a, b) => a - b);
}

function normalizeSlides(slides, files) {
    const source = Array.isArray(slides) ? slides : [];
    const fileNames = new Set(files.map(file => file.name));
    const fallbackFileRef = files[0]?.name || DEFAULT_FILE.name;
    const linesByFile = new Map(files.map(file => [file.name, lineCountOfFile(file)]));

    const normalized = source.map((entry, index) => {
        const title = normalizeNonEmptyString(entry?.title, `スライド ${index + 1}`);
        const requestedFileRef = typeof entry?.fileRef === 'string'
            ? entry.fileRef
            : fallbackFileRef;
        const fileRef = requestedFileRef === ''
            ? ''
            : (fileNames.has(requestedFileRef) ? requestedFileRef : fallbackFileRef);
        const maxLine = fileRef ? (linesByFile.get(fileRef) || 1) : 1;
        const lineRange = fileRef ? normalizeLineRange(entry?.lineRange, maxLine) : [1, 1];
        const highlightLines = fileRef
            ? normalizeHighlightLines(entry?.highlightLines, lineRange[0], lineRange[1])
            : [];
        const markdown = normalizeString(entry?.markdown, '');

        return {
            title,
            fileRef,
            lineRange,
            highlightLines,
            markdown,
        };
    });

    if (normalized.length === 0) {
        normalized.push({
            title: 'スライド 1',
            fileRef: fallbackFileRef,
            lineRange: [1, 1],
            highlightLines: [],
            markdown: '',
        });
    }

    return normalized;
}

function normalizeAssets(assets) {
    const source = Array.isArray(assets) ? assets : [];
    const usedPaths = new Set();

    return source
        .map((entry, index) => {
            if (!entry || typeof entry !== 'object') return null;

            const fallbackName = `asset-${index + 1}.bin`;
            const assetPath = makeUniqueRelativePath(
                entry.path || entry.name,
                usedPaths,
                fallbackName,
            );
            const mimeType = normalizeNonEmptyString(entry.mimeType, 'application/octet-stream');
            const kind = normalizeNonEmptyString(entry.kind, 'file');
            const sizeRaw = Number.parseInt(entry.size, 10);
            const size = Number.isFinite(sizeRaw) && sizeRaw >= 0 ? sizeRaw : 0;

            return {
                path: assetPath,
                mimeType,
                kind,
                size,
            };
        })
        .filter(Boolean);
}

function normalizeTerminalConfig(terminal) {
    const compact = normalizeString(terminal?.cwd, '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
    const cwd = compact
        .split('/')
        .map(segment => segment.trim())
        .filter(Boolean)
        .filter(segment => segment !== '.' && segment !== '..')
        .join('/');
    return { cwd };
}

export function normalizeDeckPayload(payload = {}) {
    const source = /** @type {any} */ (payload && typeof payload === 'object' ? payload : {});
    const files = normalizeFiles(source.files);
    const slides = normalizeSlides(source.slides, files);
    const terminal = normalizeTerminalConfig(source.terminal);
    const assets = normalizeAssets(source.assets);

    return {
        schemaVersion: DECK_SCHEMA_VERSION,
        title: normalizeNonEmptyString(source.title, '無題のデッキ'),
        description: normalizeString(source.description, ''),
        files,
        slides,
        terminal,
        assets,
    };
}
