import { describe, expect, test } from 'vitest';
import { reconcileDeckAfterSave } from './editor-save-state.js';

describe('reconcileDeckAfterSave', () => {
  test('uses normalized saved deck when no local edits happened during save', () => {
    const currentDeck = {
      id: 'deck-a',
      title: 'Local title',
      updatedAt: '2026-03-07T00:00:00.000Z',
      files: [{ id: 'file-1', name: 'main.py', code: 'print(1)' }],
    };
    const savedDeck = {
      id: 'deck-a',
      title: 'Server title',
      updatedAt: '2026-03-07T00:00:05.000Z',
      files: [{ id: 'file-1', name: 'src/main.py', code: 'print(1)' }],
    };

    expect(
      reconcileDeckAfterSave({
        currentDeck,
        savedDeck,
        requestDeckId: 'deck-a',
        hasLocalChanges: false,
      }),
    ).toEqual({
      deck: savedDeck,
      persistedDeckId: 'deck-a',
      renamed: false,
      shouldSyncEditor: true,
    });
  });

  test('keeps current draft when edits happened while the save was in flight', () => {
    const currentDeck = {
      id: 'deck-a',
      title: 'Newest local title',
      schemaVersion: 2,
      createdAt: '2026-03-07T00:00:00.000Z',
      updatedAt: '2026-03-07T00:00:01.000Z',
      files: [{ id: 'file-1', name: 'main.py', code: 'print(2)' }],
      slides: [{ title: 'Slide 1', markdown: 'latest local markdown' }],
    };
    const savedDeck = {
      id: 'deck-a',
      title: 'Older server title',
      schemaVersion: 3,
      createdAt: '2026-03-07T00:00:00.000Z',
      updatedAt: '2026-03-07T00:00:05.000Z',
      files: [{ id: 'file-1', name: 'src/main.py', code: 'print(1)' }],
      slides: [{ title: 'Slide 1', markdown: 'older server markdown' }],
    };

    expect(
      reconcileDeckAfterSave({
        currentDeck,
        savedDeck,
        requestDeckId: 'deck-a',
        hasLocalChanges: true,
      }),
    ).toEqual({
      deck: {
        ...currentDeck,
        schemaVersion: 3,
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:05.000Z',
      },
      persistedDeckId: 'deck-a',
      renamed: false,
      shouldSyncEditor: false,
    });
  });

  test('updates persisted deck id after a rename without overwriting newer local edits', () => {
    const currentDeck = {
      id: 'deck-next',
      title: 'Newest local title',
      files: [],
      slides: [],
    };
    const savedDeck = {
      id: 'deck-renamed',
      title: 'Saved title',
      files: [],
      slides: [],
    };

    expect(
      reconcileDeckAfterSave({
        currentDeck,
        savedDeck,
        requestDeckId: 'deck-current',
        hasLocalChanges: true,
      }),
    ).toEqual({
      deck: currentDeck,
      persistedDeckId: 'deck-renamed',
      renamed: true,
      shouldSyncEditor: false,
    });
  });
});
