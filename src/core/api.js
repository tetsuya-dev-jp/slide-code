/**
 * API Client for SlideCode deck management
 */

const BASE = '/api';
const REQUEST_TIMEOUT_MS = 15000;

function createRequestError(message, { status = 0, code = 'network-error' } = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function throwApiError(res, fallbackMessage) {
  let message = fallbackMessage;
  try {
    const payload = await res.json();
    if (payload && typeof payload.error === 'string' && payload.error.trim()) {
      message = payload.error.trim();
    }
  } catch {
    // Ignore JSON parse errors and keep fallback message.
  }

  const err = new Error(message);
  err.status = res.status;
  throw err;
}

async function request(path, { method = 'GET', headers, body } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${BASE}${path}`, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createRequestError('Request timed out', { status: 408, code: 'timeout' });
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw createRequestError('Offline', { code: 'offline' });
    }

    throw createRequestError('Network request failed');
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestJson(path, { method = 'GET', data, fallbackMessage } = {}) {
  const hasBody = data !== undefined;
  const res = await request(path, {
    method,
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) await throwApiError(res, fallbackMessage);
  return res.json();
}

async function requestBlob(path, { fallbackMessage } = {}) {
  const res = await request(path);
  if (!res.ok) await throwApiError(res, fallbackMessage);
  return res;
}

function parseContentDispositionFilename(disposition) {
  if (!disposition) return '';

  const encodedMatch = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      // Fall back to filename parsing below.
    }
  }

  const quotedMatch = disposition.match(/filename\s*=\s*"([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const bareMatch = disposition.match(/filename\s*=\s*([^;]+)/i);
  return bareMatch?.[1]?.trim() || '';
}

/** List all decks (metadata only) */
export async function listDecks() {
  return requestJson('/decks', { fallbackMessage: 'Failed to list decks' });
}

/** List quarantined or broken deck issues */
export async function listDeckIssues() {
  return requestJson('/decks/issues', { fallbackMessage: 'Failed to list deck issues' });
}

/** Get a full deck by ID */
export async function getDeck(id) {
  return requestJson(`/decks/${id}`, { fallbackMessage: 'Deck not found' });
}

/** Create a new deck */
export async function createDeck(data = {}) {
  return requestJson('/decks', {
    method: 'POST',
    data,
    fallbackMessage: 'Failed to create deck',
  });
}

/** Update an existing deck */
export async function updateDeck(id, data) {
  return requestJson(`/decks/${id}`, {
    method: 'PUT',
    data,
    fallbackMessage: 'Failed to update deck',
  });
}

/** Delete a deck */
export async function deleteDeck(id) {
  return requestJson(`/decks/${id}`, {
    method: 'DELETE',
    fallbackMessage: 'Failed to delete deck',
  });
}

/** Duplicate a deck */
export async function duplicateDeck(id, data = {}) {
  return requestJson(`/decks/${id}/duplicate`, {
    method: 'POST',
    data,
    fallbackMessage: 'Failed to duplicate deck',
  });
}

/** List available templates */
export async function listTemplates() {
  return requestJson('/templates', { fallbackMessage: 'Failed to list templates' });
}

/** Create deck from template */
export async function createDeckFromTemplate(data = {}) {
  return requestJson('/decks/from-template', {
    method: 'POST',
    data,
    fallbackMessage: 'Failed to create deck from template',
  });
}

/** Save deck as local template */
export async function saveTemplateFromDeck(id, data = {}) {
  return requestJson(`/templates/from-deck/${id}`, {
    method: 'POST',
    data,
    fallbackMessage: 'Failed to save template',
  });
}

/** Delete local templates derived from a deck */
export async function deleteTemplatesFromDeck(id) {
  return requestJson(`/templates/from-deck/${id}`, {
    method: 'DELETE',
    fallbackMessage: 'Failed to delete template',
  });
}

/** List assets for a deck */
export async function listDeckAssets(id) {
  const payload = await requestJson(`/decks/${id}/assets`, {
    fallbackMessage: 'Failed to list assets',
  });
  return Array.isArray(payload?.assets) ? payload.assets : [];
}

/** Upload an asset to a deck */
export async function uploadDeckAsset(id, data = {}) {
  return requestJson(`/decks/${id}/assets`, {
    method: 'POST',
    data,
    fallbackMessage: 'Failed to upload asset',
  });
}

/** Delete an asset from a deck */
export async function deleteDeckAsset(id, assetPath) {
  const params = new URLSearchParams();
  params.set('path', assetPath);
  return requestJson(`/decks/${id}/assets?${params.toString()}`, {
    method: 'DELETE',
    fallbackMessage: 'Failed to delete asset',
  });
}

/** Get resolvable URL for deck asset */
export function getDeckAssetUrl(id, assetPath, { download = false } = {}) {
  const params = new URLSearchParams();
  params.set('path', assetPath);
  if (download) {
    params.set('download', '1');
  }
  return `${BASE}/decks/${id}/assets/file?${params.toString()}`;
}

/** Build export URL for browser navigation */
export function getDeckExportUrl(id, format) {
  return `${BASE}/decks/${id}/export/${format}`;
}

/** Download export as blob */
export async function downloadDeckExport(id, format) {
  const endpoint = getDeckExportUrl(id, format);
  const res = await requestBlob(endpoint.slice(BASE.length), {
    fallbackMessage: 'Failed to export deck',
  });

  const disposition = res.headers.get('content-disposition') || '';
  const blob = await res.blob();
  return {
    blob,
    filename: parseContentDispositionFilename(disposition) || `deck.${format}`,
  };
}

/** List directories under terminal base cwd */
export async function listDirectories(relativePath = '') {
  const params = new URLSearchParams();
  if (typeof relativePath === 'string' && relativePath.trim()) {
    params.set('path', relativePath.trim());
  }

  const query = params.toString();
  const endpoint = query ? `${BASE}/fs/dirs?${query}` : `${BASE}/fs/dirs`;
  return requestJson(endpoint.slice(BASE.length), {
    fallbackMessage: 'Failed to list directories',
  });
}

/** List absolute directories for config picker */
export async function listSystemDirectories(pathValue = '') {
  const params = new URLSearchParams();
  if (typeof pathValue === 'string' && pathValue.trim()) {
    params.set('path', pathValue.trim());
  }

  const query = params.toString();
  const endpoint = query ? `${BASE}/fs/system-dirs?${query}` : `${BASE}/fs/system-dirs`;
  return requestJson(endpoint.slice(BASE.length), {
    fallbackMessage: 'Failed to list system directories',
  });
}

/** Get current app config */
export async function getAppConfig() {
  return requestJson('/config', { fallbackMessage: 'Failed to load app config' });
}

/** Update app config */
export async function updateAppConfig(data) {
  return requestJson('/config', {
    method: 'PUT',
    data,
    fallbackMessage: 'Failed to update app config',
  });
}
