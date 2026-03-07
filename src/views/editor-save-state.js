export function reconcileDeckAfterSave({
  currentDeck,
  savedDeck,
  requestDeckId,
  hasLocalChanges = false,
} = {}) {
  const safeSavedDeck = savedDeck && typeof savedDeck === 'object' ? savedDeck : null;
  if (!safeSavedDeck) {
    return {
      deck: currentDeck,
      persistedDeckId: typeof requestDeckId === 'string' ? requestDeckId : '',
      renamed: false,
      shouldSyncEditor: false,
    };
  }

  const renamed = typeof requestDeckId === 'string' && requestDeckId.trim()
    ? safeSavedDeck.id !== requestDeckId
    : false;

  if (!hasLocalChanges || !currentDeck || typeof currentDeck !== 'object') {
    return {
      deck: safeSavedDeck,
      persistedDeckId: safeSavedDeck.id,
      renamed,
      shouldSyncEditor: true,
    };
  }

  return {
    deck: {
      ...currentDeck,
      schemaVersion: safeSavedDeck.schemaVersion ?? currentDeck.schemaVersion,
      createdAt: safeSavedDeck.createdAt ?? currentDeck.createdAt,
      updatedAt: safeSavedDeck.updatedAt ?? currentDeck.updatedAt,
    },
    persistedDeckId: safeSavedDeck.id,
    renamed,
    shouldSyncEditor: false,
  };
}
