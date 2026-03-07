import express from 'express';
import { afterEach, describe, expect, test } from 'vitest';
import { registerApiRoutes } from './api-routes.js';
import { registerExtraRoutes } from './extra-routes.js';

const servers = [];

afterEach(async () => {
  while (servers.length) {
    await new Promise((resolve) => servers.pop().close(resolve));
  }
});

async function startServer({ runtimeConfig, storage }) {
  const app = express();
  app.use(express.json());

  const context = {
    runtimeConfig,
    storage,
    templateStorage: null,
    sharedTemplateStorage: null,
  };

  registerApiRoutes(app, {
    getContext: () => context,
    applyLatestRuntimeConfig: () => {},
  });
  registerExtraRoutes(app, () => context);

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  servers.push(server);

  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

describe('API contracts', () => {
  test('config response omits internal config path metadata', async () => {
    const baseUrl = await startServer({
      runtimeConfig: {
        configFilePath: '/private/config.json',
        decksDir: '/tmp/decks',
        templatesDir: '/tmp/templates',
        sharedTemplatesDir: '',
        terminal: { baseCwd: '/tmp', shell: '/bin/bash' },
      },
      storage: {},
    });

    const res = await fetch(`${baseUrl}/api/config`);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      decksDir: '/tmp/decks',
      templatesDir: '/tmp/templates',
      sharedTemplatesDir: '',
      terminalBaseCwd: '/tmp',
      terminalShell: '/bin/bash',
    });
    expect(payload.configFilePath).toBeUndefined();
  });

  test('print export returns printable HTML and pdf export is rejected', async () => {
    const storage = {
      getDeckJsonPath() {
        return '/tmp/missing-deck.json';
      },
      readDeck() {
        return {
          id: 'demo',
          title: 'デモ Deck',
          description: 'demo',
          files: [{ id: 'file-1', name: 'main.py', language: 'python', code: 'print(1)' }],
          slides: [{ title: 'Slide 1', fileId: 'file-1', fileRef: 'main.py', lineRange: [1, 1], highlightLines: [], markdown: 'hello' }],
          assets: [],
        };
      },
    };

    const baseUrl = await startServer({
      runtimeConfig: {
        decksDir: '/tmp/decks',
        templatesDir: '/tmp/templates',
        sharedTemplatesDir: '',
        terminal: { baseCwd: '/tmp', shell: '/bin/bash' },
      },
      storage,
    });

    const printRes = await fetch(`${baseUrl}/api/decks/demo/export/print`);
    const printHtml = await printRes.text();
    expect(printRes.status).toBe(200);
    expect(printRes.headers.get('content-type')).toContain('text/html');
    expect(printHtml).toContain('window.print()');

    const pdfRes = await fetch(`${baseUrl}/api/decks/demo/export/pdf`);
    const pdfPayload = await pdfRes.json();
    expect(pdfRes.status).toBe(400);
    expect(pdfPayload.error).toBe('PDF export is not supported; use print export');

    const htmlRes = await fetch(`${baseUrl}/api/decks/demo/export/html`);
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.headers.get('content-disposition')).toContain("filename*=UTF-8''");

    const zipRes = await fetch(`${baseUrl}/api/decks/demo/export/zip`);
    const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
    expect(zipRes.status).toBe(200);
    expect(zipRes.headers.get('content-type')).toContain('application/zip');
    expect(zipRes.headers.get('content-disposition')).toContain("filename*=UTF-8''");
    expect(zipBuffer.subarray(0, 4).toString('binary')).toBe('PK\u0003\u0004');
  });

  test('deck issues endpoint returns quarantined deck metadata', async () => {
    const storage = {
      listQuarantinedDeckIssues() {
        return [{
          deckId: 'broken-deck',
          reason: 'invalid-deck:Unexpected token',
          quarantinedAt: '2026-03-07T00:00:00.000Z',
          status: 'quarantined',
        }];
      },
    };

    const baseUrl = await startServer({
      runtimeConfig: {
        decksDir: '/tmp/decks',
        templatesDir: '/tmp/templates',
        sharedTemplatesDir: '',
        quarantineDir: '/tmp/quarantine',
        terminal: { baseCwd: '/tmp', shell: '/bin/bash' },
      },
      storage,
    });

    const res = await fetch(`${baseUrl}/api/decks/issues`);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual([
      {
        deckId: 'broken-deck',
        reason: 'invalid-deck:Unexpected token',
        quarantinedAt: '2026-03-07T00:00:00.000Z',
        status: 'quarantined',
      },
    ]);
  });

  test('asset file responses use inline only for safe preview types', async () => {
    const storage = {
      readAsset(_deckId, assetPath) {
        if (assetPath === 'diagram.png') {
          return {
            path: 'diagram.png',
            mimeType: 'image/png',
            buffer: Buffer.from('png'),
            kind: 'image',
          };
        }

        if (assetPath === 'data.json') {
          return {
            path: 'data.json',
            mimeType: 'application/json',
            buffer: Buffer.from('{"ok":true}'),
            kind: 'data',
          };
        }

        if (assetPath === 'legacy.svg') {
          return {
            path: 'legacy.svg',
            mimeType: 'image/svg+xml',
            buffer: Buffer.from('<svg />'),
            kind: 'image',
          };
        }

        throw new Error('asset-not-found');
      },
    };

    const baseUrl = await startServer({
      runtimeConfig: {
        decksDir: '/tmp/decks',
        templatesDir: '/tmp/templates',
        sharedTemplatesDir: '',
        terminal: { baseCwd: '/tmp', shell: '/bin/bash' },
      },
      storage,
    });

    const imageRes = await fetch(`${baseUrl}/api/decks/demo/assets/file?path=diagram.png`);
    expect(imageRes.status).toBe(200);
    expect(imageRes.headers.get('content-disposition')).toContain('inline;');

    const jsonRes = await fetch(`${baseUrl}/api/decks/demo/assets/file?path=data.json`);
    expect(jsonRes.status).toBe(200);
    expect(jsonRes.headers.get('content-disposition')).toContain('attachment;');

    const forcedDownloadRes = await fetch(`${baseUrl}/api/decks/demo/assets/file?path=diagram.png&download=1`);
    expect(forcedDownloadRes.status).toBe(200);
    expect(forcedDownloadRes.headers.get('content-disposition')).toContain('attachment;');

    const svgRes = await fetch(`${baseUrl}/api/decks/demo/assets/file?path=legacy.svg`);
    expect(svgRes.status).toBe(200);
    expect(svgRes.headers.get('content-disposition')).toContain('attachment;');
    expect(svgRes.headers.get('content-security-policy')).toContain('sandbox');
  });
});
