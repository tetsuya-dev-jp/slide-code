/**
 * API Client for CodeStage deck management
 */

const BASE = '/api';

/** List all decks (metadata only) */
export async function listDecks() {
    const res = await fetch(`${BASE}/decks`);
    if (!res.ok) throw new Error('Failed to list decks');
    return res.json();
}

/** Get a full deck by ID */
export async function getDeck(id) {
    const res = await fetch(`${BASE}/decks/${id}`);
    if (!res.ok) throw new Error('Deck not found');
    return res.json();
}

/** Create a new deck */
export async function createDeck(data = {}) {
    const res = await fetch(`${BASE}/decks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create deck');
    return res.json();
}

/** Update an existing deck */
export async function updateDeck(id, data) {
    const res = await fetch(`${BASE}/decks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update deck');
    return res.json();
}

/** Delete a deck */
export async function deleteDeck(id) {
    const res = await fetch(`${BASE}/decks/${id}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete deck');
    return res.json();
}
