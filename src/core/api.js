/**
 * API Client for SlideCode deck management
 */

const BASE = '/api';

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

/** List all decks (metadata only) */
export async function listDecks() {
    const res = await fetch(`${BASE}/decks`);
    if (!res.ok) await throwApiError(res, 'Failed to list decks');
    return res.json();
}

/** Get a full deck by ID */
export async function getDeck(id) {
    const res = await fetch(`${BASE}/decks/${id}`);
    if (!res.ok) await throwApiError(res, 'Deck not found');
    return res.json();
}

/** Create a new deck */
export async function createDeck(data = {}) {
    const res = await fetch(`${BASE}/decks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res, 'Failed to create deck');
    return res.json();
}

/** Update an existing deck */
export async function updateDeck(id, data) {
    const res = await fetch(`${BASE}/decks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res, 'Failed to update deck');
    return res.json();
}

/** Delete a deck */
export async function deleteDeck(id) {
    const res = await fetch(`${BASE}/decks/${id}`, {
        method: 'DELETE',
    });
    if (!res.ok) await throwApiError(res, 'Failed to delete deck');
    return res.json();
}

/** Duplicate a deck */
export async function duplicateDeck(id, data = {}) {
    const res = await fetch(`${BASE}/decks/${id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res, 'Failed to duplicate deck');
    return res.json();
}

/** List available templates */
export async function listTemplates() {
    const res = await fetch(`${BASE}/templates`);
    if (!res.ok) await throwApiError(res, 'Failed to list templates');
    return res.json();
}

/** Create deck from template */
export async function createDeckFromTemplate(data = {}) {
    const res = await fetch(`${BASE}/decks/from-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res, 'Failed to create deck from template');
    return res.json();
}

/** Save deck as local template */
export async function saveTemplateFromDeck(id, data = {}) {
    const res = await fetch(`${BASE}/templates/from-deck/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res, 'Failed to save template');
    return res.json();
}

/** Delete local templates derived from a deck */
export async function deleteTemplatesFromDeck(id) {
    const res = await fetch(`${BASE}/templates/from-deck/${id}`, {
        method: 'DELETE',
    });
    if (!res.ok) await throwApiError(res, 'Failed to delete template');
    return res.json();
}

/** List assets for a deck */
export async function listDeckAssets(id) {
    const res = await fetch(`${BASE}/decks/${id}/assets`);
    if (!res.ok) await throwApiError(res, 'Failed to list assets');
    const payload = await res.json();
    return Array.isArray(payload?.assets) ? payload.assets : [];
}

/** Upload an asset to a deck */
export async function uploadDeckAsset(id, data = {}) {
    const res = await fetch(`${BASE}/decks/${id}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res, 'Failed to upload asset');
    return res.json();
}

/** Delete an asset from a deck */
export async function deleteDeckAsset(id, assetPath) {
    const params = new URLSearchParams();
    params.set('path', assetPath);
    const res = await fetch(`${BASE}/decks/${id}/assets?${params.toString()}`, {
        method: 'DELETE',
    });
    if (!res.ok) await throwApiError(res, 'Failed to delete asset');
    return res.json();
}

/** Get resolvable URL for deck asset */
export function getDeckAssetUrl(id, assetPath) {
    const params = new URLSearchParams();
    params.set('path', assetPath);
    return `${BASE}/decks/${id}/assets/file?${params.toString()}`;
}

/** Build export URL for browser navigation */
export function getDeckExportUrl(id, format) {
    return `${BASE}/decks/${id}/export/${format}`;
}

/** Download export as blob */
export async function downloadDeckExport(id, format) {
    const endpoint = getDeckExportUrl(id, format);
    const res = await fetch(endpoint);
    if (!res.ok) await throwApiError(res, 'Failed to export deck');

    const disposition = res.headers.get('content-disposition') || '';
    const filenameMatch = disposition.match(/filename="([^"]+)"/i);
    const blob = await res.blob();
    return {
        blob,
        filename: filenameMatch?.[1] || `deck.${format}`,
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
    const res = await fetch(endpoint);
    if (!res.ok) await throwApiError(res, 'Failed to list directories');
    return res.json();
}

/** List absolute directories for config picker */
export async function listSystemDirectories(pathValue = '') {
    const params = new URLSearchParams();
    if (typeof pathValue === 'string' && pathValue.trim()) {
        params.set('path', pathValue.trim());
    }

    const query = params.toString();
    const endpoint = query ? `${BASE}/fs/system-dirs?${query}` : `${BASE}/fs/system-dirs`;
    const res = await fetch(endpoint);
    if (!res.ok) await throwApiError(res, 'Failed to list system directories');
    return res.json();
}

/** Get current app config */
export async function getAppConfig() {
    const res = await fetch(`${BASE}/config`);
    if (!res.ok) await throwApiError(res, 'Failed to load app config');
    return res.json();
}

/** Update app config */
export async function updateAppConfig(data) {
    const res = await fetch(`${BASE}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res, 'Failed to update app config');
    return res.json();
}
