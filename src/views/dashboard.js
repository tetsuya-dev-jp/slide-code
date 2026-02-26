/**
 * Dashboard View
 * Displays deck list with CRUD operations
 */

import * as api from '../core/api.js';
import { showToast, escapeHtml, formatDate } from '../utils/helpers.js';

export function initDashboard(router) {
  // New deck button
  document.getElementById('newDeckBtn').addEventListener('click', async () => {
    try {
      const deck = await api.createDeck({ title: '新しいデッキ' });
      router.navigate(`/deck/${deck.id}/edit`);
    } catch {
      showToast('デッキの作成に失敗しました');
    }
  });

  // Import button
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });

  document.getElementById('importFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await api.createDeck({
        title: data.title || file.name.replace('.json', ''),
        description: data.description || '',
        slides: data.slides || [],
      });
      showToast('インポートしました');
      show();
    } catch {
      showToast('インポートに失敗しました');
    }
    e.target.value = '';
  });

  async function exportDeck(id) {
    try {
      const deck = await api.getDeck(id);
      const blob = new Blob([JSON.stringify(deck, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${deck.title || 'deck'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('エクスポートしました');
    } catch {
      showToast('エクスポートに失敗しました');
    }
  }

  async function handleDeleteDeck(id) {
    if (!confirm('このデッキを削除しますか？')) return;
    try {
      await api.deleteDeck(id);
      showToast('削除しました');
      show();
    } catch {
      showToast('削除に失敗しました');
    }
  }

  function renderDeckGrid(decks) {
    const grid = document.getElementById('deckGrid');
    if (decks.length === 0) {
      grid.innerHTML = `
        <div class="deck-empty">
          <p>まだデッキがありません</p>
          <button class="btn btn-primary" onclick="document.getElementById('newDeckBtn').click()">最初のデッキを作成</button>
        </div>`;
      return;
    }

    grid.innerHTML = decks.map(deck => `
      <div class="deck-card" data-id="${deck.id}">
        <div class="deck-card-body">
          <h3 class="deck-card-title">${escapeHtml(deck.title)}</h3>
          <p class="deck-card-desc">${escapeHtml(deck.description || '')}</p>
          <div class="deck-card-meta">
            <span>${deck.slideCount} スライド</span>
            <span>${formatDate(deck.updatedAt)}</span>
          </div>
        </div>
        <div class="deck-card-actions">
          <button class="btn-icon deck-open" data-id="${deck.id}" title="開く">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </button>
          <button class="btn-icon deck-edit" data-id="${deck.id}" title="編集">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="btn-icon deck-export" data-id="${deck.id}" title="エクスポート">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          </button>
          <button class="btn-icon deck-delete" data-id="${deck.id}" title="削除">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.deck-open').forEach(btn => {
      btn.addEventListener('click', () => router.navigate(`/deck/${btn.dataset.id}`));
    });
    grid.querySelectorAll('.deck-edit').forEach(btn => {
      btn.addEventListener('click', () => router.navigate(`/deck/${btn.dataset.id}/edit`));
    });
    grid.querySelectorAll('.deck-export').forEach(btn => {
      btn.addEventListener('click', () => exportDeck(btn.dataset.id));
    });
    grid.querySelectorAll('.deck-delete').forEach(btn => {
      btn.addEventListener('click', () => handleDeleteDeck(btn.dataset.id));
    });
  }

  async function show() {
    const grid = document.getElementById('deckGrid');
    grid.innerHTML = '<div class="deck-loading">読み込み中...</div>';
    try {
      const decks = await api.listDecks();
      renderDeckGrid(decks);
    } catch (err) {
      grid.innerHTML = '<div class="deck-error">デッキの読み込みに失敗しました</div>';
      console.error(err);
    }
  }

  return { show };
}
