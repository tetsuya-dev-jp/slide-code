import fs from 'fs';

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeFileName(value, fallback) {
    const normalized = String(value || '')
        .trim()
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_');
    return normalized || fallback;
}

function resolveSlideCode(slide, deck) {
    const files = deck?.files || [];
    const requestedFileId = typeof slide?.fileId === 'string' ? slide.fileId.trim() : '';
    const requestedFileRef = typeof slide?.fileRef === 'string' ? slide.fileRef.trim() : '';
    const file = requestedFileId
        ? (files.find(item => item.id === requestedFileId) || files.find(item => item.name === requestedFileRef))
        : files.find(item => item.name === requestedFileRef);
    if (!file) return { code: '', language: 'plaintext', lineStart: 1, lineEnd: 1 };

    const lines = (file.code || '').split('\n');
    const totalLines = Math.max(lines.length, 1);
    const requestedStart = Number.parseInt(Array.isArray(slide.lineRange) ? slide.lineRange[0] : 1, 10);
    const requestedEnd = Number.parseInt(Array.isArray(slide.lineRange) ? slide.lineRange[1] : requestedStart, 10);
    const start = Math.min(Math.max(Number.isFinite(requestedStart) ? requestedStart : 1, 1), totalLines);
    const end = Math.min(Math.max(Number.isFinite(requestedEnd) ? requestedEnd : start, start), totalLines);
    const code = lines.slice(start - 1, end).join('\n');

    return {
        code,
        language: file.language || 'plaintext',
        lineStart: start,
        lineEnd: end,
    };
}

function extractAssetRefs(markdown) {
    if (typeof markdown !== 'string' || !markdown.trim()) return [];
    const refs = new Set();
    const pattern = /asset:\/\/([^\s)"'`<>]+)/g;
    let match = pattern.exec(markdown);
    while (match) {
        refs.add(match[1]);
        match = pattern.exec(markdown);
    }
    return Array.from(refs);
}

function markdownToSimpleHtml(markdown, assetDataUriByPath) {
    const safeMarkdown = typeof markdown === 'string' ? markdown : '';
    const escaped = escapeHtml(safeMarkdown).replace(/\n/g, '<br />');
    const refs = extractAssetRefs(safeMarkdown);

    const images = refs
        .map((assetPath) => {
            const src = assetDataUriByPath.get(assetPath) || '';
            if (!src) return '';
            return `<div class="asset-image"><img src="${src}" alt="${escapeHtml(assetPath)}" /></div>`;
        })
        .filter(Boolean)
        .join('');

    return `<div class="markdown-block">${escaped}</div>${images}`;
}

function createAssetDataUriMap(storage, deck) {
    const map = new Map();
    (deck.assets || []).forEach((asset) => {
        if (!asset?.exists) return;
        try {
            const resolved = storage.readAsset(deck.id, asset.path);
            const base64 = resolved.buffer.toString('base64');
            map.set(asset.path, `data:${resolved.mimeType};base64,${base64}`);
        } catch {
            // Skip unreadable asset.
        }
    });
    return map;
}

function renderExportHtml({ deck, printMode, assetDataUriByPath }) {
    const slideSections = (deck.slides || []).map((slide, index) => {
        const resolved = resolveSlideCode(slide, deck);
        const markdownHtml = markdownToSimpleHtml(slide.markdown || '', assetDataUriByPath);

        return `
        <article class="slide">
          <header class="slide-header">
            <h2>${escapeHtml(slide.title || `スライド ${index + 1}`)}</h2>
            <p>${escapeHtml(resolved.language)} / ${resolved.lineStart}-${resolved.lineEnd}</p>
          </header>
          <section class="slide-code"><pre><code>${escapeHtml(resolved.code || '')}</code></pre></section>
          <section class="slide-markdown"><h3>解説</h3>${markdownHtml}</section>
        </article>
      `;
    }).join('');

    const printScript = printMode
        ? '<script>window.addEventListener("load", () => window.print());</script>'
        : '';

    return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(deck.title)} - SlideCode Export</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: "Inter", sans-serif; background: #f7f8fa; color: #111827; }
    .container { max-width: 980px; margin: 0 auto; padding: 24px; }
    .deck-header { margin-bottom: 20px; }
    .deck-header h1 { margin: 0 0 8px; font-size: 28px; }
    .deck-header p { margin: 0; color: #4b5563; }
    .slide { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 16px; break-inside: avoid; }
    .slide-header { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
    .slide-header h2 { margin: 0; font-size: 20px; }
    .slide-header p { margin: 0; color: #6b7280; font-size: 12px; }
    .slide-code pre { margin: 10px 0 0; padding: 12px; background: #111827; color: #f9fafb; border-radius: 8px; overflow: auto; }
    .slide-code code { font-family: "JetBrains Mono", monospace; font-size: 12px; line-height: 1.5; }
    .slide-markdown h3 { margin: 14px 0 8px; font-size: 14px; }
    .markdown-block { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; line-height: 1.6; white-space: normal; }
    .asset-image { margin-top: 10px; }
    .asset-image img { max-width: 100%; border-radius: 8px; border: 1px solid #e5e7eb; }
    @media print {
      body { background: #fff; }
      .container { max-width: none; padding: 0; }
      .slide { border: 1px solid #d1d5db; margin: 0 0 12px; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="deck-header">
      <h1>${escapeHtml(deck.title || '無題のデッキ')}</h1>
      <p>${escapeHtml(deck.description || '')}</p>
    </header>
    ${slideSections}
  </div>
  ${printScript}
</body>
</html>`;
}

function crc32(buffer) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < buffer.length; i += 1) {
        crc ^= buffer[i];
        for (let j = 0; j < 8; j += 1) {
            const mask = -(crc & 1);
            crc = (crc >>> 1) ^ (0xEDB88320 & mask);
        }
    }
    return (crc ^ (-1)) >>> 0;
}

function toDosDateTime(date) {
    const d = date instanceof Date ? date : new Date();
    const year = Math.max(d.getFullYear(), 1980);
    const dosDate = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    return { dosDate, dosTime };
}

function createZipBuffer(entries) {
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;

    entries.forEach((entry) => {
        const name = String(entry.name || '').replace(/\\/g, '/');
        const nameBuffer = Buffer.from(name, 'utf-8');
        const dataBuffer = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data || ''), 'utf-8');
        const crc = crc32(dataBuffer);
        const { dosDate, dosTime } = toDosDateTime(entry.date);

        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0, 6);
        localHeader.writeUInt16LE(0, 8);
        localHeader.writeUInt16LE(dosTime, 10);
        localHeader.writeUInt16LE(dosDate, 12);
        localHeader.writeUInt32LE(crc, 14);
        localHeader.writeUInt32LE(dataBuffer.length, 18);
        localHeader.writeUInt32LE(dataBuffer.length, 22);
        localHeader.writeUInt16LE(nameBuffer.length, 26);
        localHeader.writeUInt16LE(0, 28);

        localParts.push(localHeader, nameBuffer, dataBuffer);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0, 8);
        centralHeader.writeUInt16LE(0, 10);
        centralHeader.writeUInt16LE(dosTime, 12);
        centralHeader.writeUInt16LE(dosDate, 14);
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(dataBuffer.length, 20);
        centralHeader.writeUInt32LE(dataBuffer.length, 24);
        centralHeader.writeUInt16LE(nameBuffer.length, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        centralHeader.writeUInt32LE(0, 38);
        centralHeader.writeUInt32LE(localOffset, 42);

        centralParts.push(centralHeader, nameBuffer);
        localOffset += localHeader.length + nameBuffer.length + dataBuffer.length;
    });

    const centralDirectory = Buffer.concat(centralParts);
    const endRecord = Buffer.alloc(22);
    endRecord.writeUInt32LE(0x06054b50, 0);
    endRecord.writeUInt16LE(0, 4);
    endRecord.writeUInt16LE(0, 6);
    endRecord.writeUInt16LE(entries.length, 8);
    endRecord.writeUInt16LE(entries.length, 10);
    endRecord.writeUInt32LE(centralDirectory.length, 12);
    endRecord.writeUInt32LE(localOffset, 16);
    endRecord.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

export function createDeckExportHtml({ storage, deckId, printMode = false }) {
    const deck = storage.readDeck(deckId);
    const assetDataUriByPath = createAssetDataUriMap(storage, deck);
    const html = renderExportHtml({ deck, printMode, assetDataUriByPath });
    const baseName = normalizeFileName(deck.title, deck.id || 'deck');
    return {
        deck,
        html,
        filename: `${baseName}.html`,
    };
}

export function createDeckExportZip({ storage, deckId }) {
    const { deck, html } = createDeckExportHtml({ storage, deckId, printMode: false });
    const entries = [];

    const manifestPath = storage.getDeckJsonPath(deck.id);
    if (fs.existsSync(manifestPath)) {
        entries.push({ name: 'deck.json', data: fs.readFileSync(manifestPath) });
    }

    (deck.files || []).forEach((file) => {
        entries.push({ name: `files/${file.name}`, data: file.code || '' });
    });

    (deck.assets || []).forEach((asset) => {
        if (!asset?.exists) return;
        try {
            const resolved = storage.readAsset(deck.id, asset.path);
            entries.push({ name: `assets/${asset.path}`, data: resolved.buffer });
        } catch {
            // Skip unreadable assets.
        }
    });

    entries.push({ name: 'slides.html', data: html });

    const baseName = normalizeFileName(deck.title, deck.id || 'deck');
    return {
        buffer: createZipBuffer(entries),
        filename: `${baseName}.zip`,
    };
}
