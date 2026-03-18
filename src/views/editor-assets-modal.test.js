import { beforeEach, describe, expect, test, vi } from 'vitest';
import { initEditorAssetsModal } from './editor-assets-modal.js';

function flush() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function buildDom() {
  document.body.innerHTML = `
    <button id="editorAssetsBtn" type="button">assets</button>
    <p id="editorAssetWarning" hidden></p>
    <div id="editorAssetsModal" hidden>
      <button id="editorAssetsClose" type="button">close</button>
      <button id="editorAssetsUploadBtn" type="button">upload</button>
      <input id="editorAssetsFileInput" type="file" />
      <div id="editorAssetsList"></div>
      <p id="editorAssetsBrokenRefs"></p>
    </div>
  `;
}

describe('editor assets modal', () => {
  beforeEach(() => {
    buildDom();
  });

  test('renders asset metadata, previews, and download links', async () => {
    const assets = [
      { path: 'diagram.png', mimeType: 'image/png', kind: 'image', size: 1536, exists: true },
      { path: 'notes.json', mimeType: 'application/json', kind: 'data', size: 42, exists: true },
      { path: 'legacy.svg', mimeType: 'image/svg+xml', kind: 'image', size: 128, exists: true },
    ];
    const api = {
      listDeckAssets: vi.fn().mockResolvedValue(assets),
      deleteDeckAsset: vi.fn(),
      uploadDeckAsset: vi.fn(),
      getDeckAssetUrl: vi.fn((deckId, assetPath, options = {}) => {
        const params = new URLSearchParams({ path: assetPath });
        if (options.download) params.set('download', '1');
        return `/api/decks/${deckId}/assets/file?${params.toString()}`;
      }),
    };

    const controller = initEditorAssetsModal({
      api,
      showToast: vi.fn(),
      trapFocusInModal: vi.fn(),
      restoreFocus: vi.fn(),
      getDeckId: () => 'deck-1',
      getSlides: () => [],
      getAssets: () => assets,
      setAssets: vi.fn(),
      insertAssetReference: vi.fn(),
    });

    await controller.openAssetsModal(document.getElementById('editorAssetsBtn'));

    const listText = document.getElementById('editorAssetsList').textContent;
    expect(listText).toContain('diagram.png');
    expect(listText).toContain('画像');
    expect(listText).toContain('1.5 KB');
    expect(listText).toContain('notes.json');
    expect(listText).toContain('データ');
    expect(listText).toContain('SVG はダウンロードのみ');

    const image = document.querySelector('.editor-assets-item-preview img');
    expect(image?.getAttribute('src')).toContain('path=diagram.png');

    const downloadLinks = Array.from(document.querySelectorAll('.editor-assets-item-actions a'));
    expect(downloadLinks).toHaveLength(3);
    expect(downloadLinks[0].getAttribute('href')).toContain('download=1');
  });

  test('uploads assets without forcing image kind', async () => {
    const uploadPayload = { assets: [] };
    const api = {
      listDeckAssets: vi.fn().mockResolvedValue([]),
      deleteDeckAsset: vi.fn(),
      uploadDeckAsset: vi.fn().mockResolvedValue(uploadPayload),
      getDeckAssetUrl: vi.fn(() => '/asset'),
    };
    const setAssets = vi.fn();

    initEditorAssetsModal({
      api,
      showToast: vi.fn(),
      trapFocusInModal: vi.fn(),
      restoreFocus: vi.fn(),
      getDeckId: () => 'deck-1',
      getSlides: () => [],
      getAssets: () => [],
      setAssets,
      insertAssetReference: vi.fn(),
    });

    const file = new File(['{"ok":true}'], 'notes.json', { type: 'application/json' });
    const input = document.getElementById('editorAssetsFileInput');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    });

    input.dispatchEvent(new Event('change'));
    await flush();

    expect(api.uploadDeckAsset).toHaveBeenCalledWith(
      'deck-1',
      expect.objectContaining({
        name: 'notes.json',
        mimeType: 'application/json',
      }),
    );
    const payload = api.uploadDeckAsset.mock.calls[0][1];
    expect(payload.kind).toBeUndefined();
    expect(payload.contentBase64).toBeTruthy();
    expect(setAssets).toHaveBeenCalledWith([]);
  });

  test('treats assets without exists flag as available for broken reference checks', () => {
    const assets = [
      { path: 'images/overview.svg', mimeType: 'image/svg+xml', kind: 'image', size: 128 },
      { path: 'out-of-control.jpg', mimeType: 'image/jpeg', kind: 'image', size: 1536 },
    ];

    const controller = initEditorAssetsModal({
      api: {
        listDeckAssets: vi.fn(),
        deleteDeckAsset: vi.fn(),
        uploadDeckAsset: vi.fn(),
        getDeckAssetUrl: vi.fn(() => '/asset'),
      },
      showToast: vi.fn(),
      trapFocusInModal: vi.fn(),
      restoreFocus: vi.fn(),
      getDeckId: () => 'deck-1',
      getSlides: () => [
        {
          markdown: '![構成図](asset://images/overview.svg)\n![hello](asset://out-of-control.jpg)',
        },
      ],
      getAssets: () => assets,
      setAssets: vi.fn(),
      insertAssetReference: vi.fn(),
    });

    controller.refreshBrokenReferences();

    expect(document.getElementById('editorAssetsBrokenRefs').textContent).toBe(
      '参照切れはありません',
    );
    expect(document.getElementById('editorAssetsBrokenRefs').dataset.state).toBe('ok');
    expect(document.getElementById('editorAssetWarning').hidden).toBe(true);
  });

  test('shows concise inline warning only for actually missing assets', () => {
    const controller = initEditorAssetsModal({
      api: {
        listDeckAssets: vi.fn(),
        deleteDeckAsset: vi.fn(),
        uploadDeckAsset: vi.fn(),
        getDeckAssetUrl: vi.fn(() => '/asset'),
      },
      showToast: vi.fn(),
      trapFocusInModal: vi.fn(),
      restoreFocus: vi.fn(),
      getDeckId: () => 'deck-1',
      getSlides: () => [
        { markdown: '![構成図](asset://images/overview.svg)\n![hello](asset://missing.jpg)' },
      ],
      getAssets: () => [
        {
          path: 'images/overview.svg',
          mimeType: 'image/svg+xml',
          kind: 'image',
          size: 128,
          exists: true,
        },
      ],
      setAssets: vi.fn(),
      insertAssetReference: vi.fn(),
    });

    controller.refreshBrokenReferences();

    expect(document.getElementById('editorAssetsBrokenRefs').textContent).toContain(
      'asset://missing.jpg',
    );
    expect(document.getElementById('editorAssetsBrokenRefs').textContent).not.toContain(
      'asset://images/overview.svg',
    );
    expect(document.getElementById('editorAssetsBrokenRefs').dataset.state).toBe('warning');
    expect(document.getElementById('editorAssetWarning').hidden).toBe(false);
    expect(document.getElementById('editorAssetWarning').textContent).toBe(
      '参照切れの素材が 1 件あります。素材管理から確認してください。',
    );
  });
});
