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
      readDeck() {
        return {
          id: 'demo',
          title: 'Demo Deck',
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
  });
});
