import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getLastEditorState,
  getLastPresentationState,
  getLastRoute,
  getRecentDecks,
  recordRecentDeck,
  setLastEditorState,
  setLastPresentationState,
  setLastRoute,
} from './preferences.js';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('preferences', () => {
  test('stores only valid routes', () => {
    expect(setLastRoute('/deck/demo/edit')).toBe(true);
    expect(getLastRoute()).toBe('/deck/demo/edit');

    expect(setLastRoute('javascript:alert(1)')).toBe(false);
    expect(getLastRoute()).toBe('/deck/demo/edit');
  });

  test('keeps recent decks in newest-first order without duplicates', () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(300);

    recordRecentDeck({ id: 'deck-a', title: 'Deck A' });
    recordRecentDeck({ id: 'deck-b', title: 'Deck B' });
    recordRecentDeck({ id: 'deck-a', title: 'Deck A Updated' });

    expect(getRecentDecks()).toEqual([
      { id: 'deck-a', title: 'Deck A Updated', lastOpenedAt: 300 },
      { id: 'deck-b', title: 'Deck B', lastOpenedAt: 200 },
    ]);
  });

  test('returns deck-scoped editor and presentation state', () => {
    setLastEditorState({ deckId: 'deck-a', slideIndex: 2, fileId: 'file-2' });
    setLastPresentationState({ deckId: 'deck-a', slideIndex: 1 });

    expect(getLastEditorState('deck-a')).toEqual({
      deckId: 'deck-a',
      slideIndex: 2,
      fileId: 'file-2',
    });
    expect(getLastEditorState('deck-b')).toBeNull();

    expect(getLastPresentationState('deck-a')).toEqual({
      deckId: 'deck-a',
      slideIndex: 1,
    });
    expect(getLastPresentationState('deck-b')).toBeNull();
  });
});
