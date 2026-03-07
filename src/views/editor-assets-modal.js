import { parseAssetReferences } from '../core/asset-refs.js';

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function formatAssetSize(size) {
  const bytes = Number.parseInt(size, 10);
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${Math.max(bytes || 0, 0)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAssetKindLabel(asset) {
  const kind = typeof asset?.kind === 'string' ? asset.kind : 'file';
  if (kind === 'image') return '画像';
  if (kind === 'document') return '文書';
  if (kind === 'text') return 'テキスト';
  if (kind === 'data') return 'データ';
  return 'ファイル';
}

function isPreviewableAsset(asset) {
  const mimeType = typeof asset?.mimeType === 'string' ? asset.mimeType.toLowerCase() : '';
  return mimeType.startsWith('image/') && mimeType !== 'image/svg+xml';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, (char) => {
    if (char === '&') return '&amp;';
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    return '&quot;';
  });
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

export function initEditorAssetsModal({
  api,
  showToast,
  trapFocusInModal,
  restoreFocus,
  getDeckId,
  getSlides,
  getAssets,
  setAssets,
  insertAssetReference,
}) {
  const openBtn = document.getElementById('editorAssetsBtn');
  const modalEl = document.getElementById('editorAssetsModal');
  const closeBtn = document.getElementById('editorAssetsClose');
  const uploadBtn = document.getElementById('editorAssetsUploadBtn');
  const fileInputEl = document.getElementById('editorAssetsFileInput');
  const listEl = document.getElementById('editorAssetsList');
  const brokenRefsEl = document.getElementById('editorAssetsBrokenRefs');
  const inlineWarningEl = document.getElementById('editorAssetWarning');

  if (!openBtn || !modalEl || !closeBtn || !uploadBtn || !fileInputEl || !listEl || !brokenRefsEl || !inlineWarningEl) {
    return {
      refreshBrokenReferences: () => {},
      openAssetsModal: () => {},
    };
  }

  let triggerEl = null;

  function getBrokenReferences() {
    const slides = Array.isArray(getSlides()) ? getSlides() : [];
    const assets = Array.isArray(getAssets()) ? getAssets() : [];
    const existing = new Set(assets.filter(asset => asset?.exists).map(asset => asset.path));
    const broken = new Set();

    slides.forEach((slide) => {
      parseAssetReferences(slide?.markdown || '').forEach((ref) => {
        if (!existing.has(ref)) broken.add(ref);
      });
    });

    return Array.from(broken).sort((a, b) => a.localeCompare(b));
  }

  function renderBrokenReferenceText() {
    const brokenRefs = getBrokenReferences();
    if (!brokenRefs.length) {
      brokenRefsEl.textContent = '参照切れはありません';
      inlineWarningEl.hidden = true;
      inlineWarningEl.textContent = '';
      return;
    }

    const displayText = brokenRefs.slice(0, 3).map(ref => `asset://${ref}`).join(', ');
    const suffix = brokenRefs.length > 3 ? ` ほか${brokenRefs.length - 3}件` : '';
    brokenRefsEl.textContent = `参照切れ: ${displayText}${suffix}`;
    inlineWarningEl.hidden = false;
    inlineWarningEl.textContent = `参照切れがあります: ${displayText}${suffix}`;
  }

  function renderAssetsList() {
    const assets = Array.isArray(getAssets()) ? getAssets() : [];
    const deckId = getDeckId();
    if (!assets.length) {
      listEl.innerHTML = '<p class="modal-hint">素材はまだありません</p>';
      renderBrokenReferenceText();
      return;
    }

    listEl.innerHTML = assets.map((asset) => `
      <div class="editor-assets-item">
        <div class="editor-assets-item-main">
          <div class="editor-assets-item-header">
            <span class="editor-assets-item-path">${escapeHtml(asset.path)}</span>
            <span class="editor-assets-item-kind">${escapeHtml(getAssetKindLabel(asset))}</span>
          </div>
          <div class="editor-assets-item-meta">${escapeHtml(formatAssetSize(asset.size))} / ${escapeHtml(asset.mimeType || 'application/octet-stream')}${asset.mimeType === 'image/svg+xml' ? ' / SVG はダウンロードのみ' : ''}</div>
          ${deckId && isPreviewableAsset(asset)
            ? `<div class="editor-assets-item-preview"><img src="${escapeAttribute(api.getDeckAssetUrl(deckId, asset.path))}" alt="${escapeAttribute(asset.path)}" loading="lazy" /></div>`
            : ''}
        </div>
        <div class="editor-assets-item-actions">
          <button class="editor-inline-action" data-insert-asset="${escapeAttribute(asset.path)}" type="button">挿入</button>
          ${deckId ? `<a class="editor-inline-action" href="${escapeAttribute(api.getDeckAssetUrl(deckId, asset.path, { download: true }))}" download>保存</a>` : ''}
          <button class="editor-inline-action" data-delete-asset="${escapeAttribute(asset.path)}" type="button">削除</button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-insert-asset]').forEach((button) => {
      button.addEventListener('click', () => {
        const assetPath = button.dataset.insertAsset;
        if (!assetPath) return;
        insertAssetReference(assetPath);
      });
    });

    listEl.querySelectorAll('[data-delete-asset]').forEach((button) => {
      button.addEventListener('click', async () => {
        const assetPath = button.dataset.deleteAsset;
        if (!assetPath) return;

        const deckId = getDeckId();
        if (!deckId) {
          showToast('デッキの保存後に素材削除できます');
          return;
        }

        try {
          const payload = await api.deleteDeckAsset(deckId, assetPath);
          const nextAssets = Array.isArray(payload?.assets) ? payload.assets : [];
          setAssets(nextAssets);
          renderAssetsList();
          showToast('素材を削除しました');
        } catch {
          showToast('素材の削除に失敗しました');
        }
      });
    });

    renderBrokenReferenceText();
  }

  async function refreshAssetsFromServer() {
    const deckId = getDeckId();
    if (!deckId) {
      setAssets([]);
      renderAssetsList();
      return;
    }

    try {
      const assets = await api.listDeckAssets(deckId);
      setAssets(assets);
      renderAssetsList();
    } catch {
      showToast('素材一覧の取得に失敗しました');
    }
  }

  function closeAssetsModal({ restore = true } = {}) {
    modalEl.hidden = true;
    if (restore) {
      restoreFocus(triggerEl);
    }
    triggerEl = null;
  }

  async function openAssetsModal(nextTriggerEl = document.activeElement) {
    triggerEl = nextTriggerEl instanceof HTMLElement ? nextTriggerEl : null;
    modalEl.hidden = false;
    await refreshAssetsFromServer();
    uploadBtn.focus();
  }

  uploadBtn.addEventListener('click', () => {
    fileInputEl.click();
  });

  fileInputEl.addEventListener('change', async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const deckId = getDeckId();
    if (!deckId) {
      showToast('デッキの保存後に素材アップロードできます');
      event.target.value = '';
      return;
    }

    for (const file of files) {
      try {
        const contentBase64 = arrayBufferToBase64(await file.arrayBuffer());
        const payload = await api.uploadDeckAsset(deckId, {
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          contentBase64,
        });
        const nextAssets = Array.isArray(payload?.assets) ? payload.assets : [];
        setAssets(nextAssets);
      } catch {
        showToast(`素材アップロードに失敗しました: ${file.name}`);
      }
    }

    renderAssetsList();
    event.target.value = '';
  });

  closeBtn.addEventListener('click', () => closeAssetsModal());
  modalEl.addEventListener('click', (event) => {
    if (event.target === modalEl) {
      closeAssetsModal();
    }
  });

  openBtn.addEventListener('click', (event) => {
    openAssetsModal(event.currentTarget);
  });

  document.addEventListener('keydown', (event) => {
    if (modalEl.hidden) return;
    if (event.key === 'Escape') {
      closeAssetsModal();
      return;
    }
    trapFocusInModal(event, modalEl);
  });

  return {
    refreshBrokenReferences: renderBrokenReferenceText,
    openAssetsModal,
  };
}
