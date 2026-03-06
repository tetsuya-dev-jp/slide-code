import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import { createDeckExportHtml, createDeckExportZip } from './export-service.js';

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function createStorage() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codestage-export-'));
  tempDirs.push(rootDir);

  const manifestPath = path.join(rootDir, 'deck.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ ok: true }), 'utf-8');

  return {
    getDeckJsonPath() {
      return manifestPath;
    },
    readAsset(_deckId, assetPath) {
      return {
        buffer: Buffer.from(`asset:${assetPath}`),
        mimeType: 'image/png',
      };
    },
    readDeck() {
      return {
        id: 'demo',
        title: 'Export Demo',
        description: 'deck description',
        files: [{ id: 'file-1', name: 'main.py', language: 'python', code: 'print(1)' }],
        slides: [{
          title: 'Slide 1',
          fileId: 'file-1',
          fileRef: 'main.py',
          lineRange: [1, 1],
          highlightLines: [],
          markdown: '# Heading\n\n> [!TIP]\n> demo\n\n![Diagram](asset://diagram.png)\n\n\`\`\`mermaid\ngraph TD\nA-->B\n\`\`\`\n\nInline $a+b$.',
        }],
        assets: [{ path: 'diagram.png', exists: true }],
      };
    },
  };
}

describe('export-service', () => {
  test('renders standalone export html with rich markdown and inlined assets', () => {
    const result = createDeckExportHtml({
      storage: createStorage(),
      deckId: 'demo',
      printMode: false,
    });

    expect(result.html).toContain('<h1>Heading</h1>');
    expect(result.html).toContain('class="callout callout-tip"');
    expect(result.html).toContain('class="katex"');
    expect(result.html).toContain('class="mermaid"');
    expect(result.html).toContain('data:image/png;base64,');
    expect(result.html).toContain('mermaid.esm.min.mjs');
  });

  test('builds zip export with relative asset references instead of data uris', () => {
    const result = createDeckExportZip({
      storage: createStorage(),
      deckId: 'demo',
    });
    const zipText = result.buffer.toString('utf-8');

    expect(zipText).toContain('slides.html');
    expect(zipText).toContain('assets/diagram.png');
    expect(zipText).not.toContain('data:image/png;base64,');
    expect(zipText).toContain('src="assets/diagram.png"');
  });
});
