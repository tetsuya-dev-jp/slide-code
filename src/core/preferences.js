import { getStoredItem, setStoredItem } from '../utils/storage.js';

const LAST_ROUTE_KEY = 'slidecode-last-route';
const LAST_EDITOR_STATE_KEY = 'slidecode-last-editor-state';
const LAST_PRESENTATION_STATE_KEY = 'slidecode-last-presentation-state';
const RECENT_DECKS_KEY = 'slidecode-recent-decks';
const EDITOR_PREFERENCES_KEY = 'slidecode-editor-preferences';
const MERMAID_PREFERENCES_KEY = 'slidecode-mermaid-preferences';
const MAX_RECENT_DECKS = 12;
const MAX_MERMAID_PREFERENCES = 120;

const DEFAULT_EDITOR_PREFERENCES = {
  fontSize: 14,
  tabSize: 2,
  wordWrap: 'off',
  lineNumbers: 'on',
  minimap: true,
  autosave: true,
  autosaveDelay: 1500,
};

function readJson(key, fallback) {
  const raw = getStoredItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  return setStoredItem(key, JSON.stringify(value));
}

function isValidRoute(path) {
  return typeof path === 'string' && /^\/(|deck\/[A-Za-z0-9_-]+(?:\/edit)?)$/.test(path);
}

function sanitizeDeckId(deckId) {
  return typeof deckId === 'string' && /^[A-Za-z0-9_-]+$/.test(deckId) ? deckId : '';
}

function sanitizePreferenceToken(token) {
  if (typeof token !== 'string') return '';
  const normalized = token.trim().slice(0, 160);
  return /^[A-Za-z0-9:_-]+$/.test(normalized) ? normalized : '';
}

function sanitizeIndex(index) {
  return Number.isInteger(index) && index >= 0 ? index : 0;
}

function getMermaidPreferenceCompositeKey(scope, diagramId) {
  const safeScope = sanitizePreferenceToken(scope);
  const safeDiagramId = sanitizePreferenceToken(diagramId);
  if (!safeScope || !safeDiagramId) return '';
  return `${safeScope}::${safeDiagramId}`;
}

export function getLastRoute() {
  const route = getStoredItem(LAST_ROUTE_KEY);
  return isValidRoute(route) ? route : null;
}

export function setLastRoute(path) {
  if (!isValidRoute(path)) return false;
  return setStoredItem(LAST_ROUTE_KEY, path);
}

export function getLastEditorState(deckId) {
  const state = readJson(LAST_EDITOR_STATE_KEY, null);
  if (!state || sanitizeDeckId(state.deckId) !== sanitizeDeckId(deckId)) {
    return null;
  }

  return {
    deckId: state.deckId,
    slideIndex: sanitizeIndex(state.slideIndex),
    fileId: typeof state.fileId === 'string' ? state.fileId : '',
  };
}

export function setLastEditorState({ deckId, slideIndex, fileId = '' }) {
  const safeDeckId = sanitizeDeckId(deckId);
  if (!safeDeckId) return false;
  return writeJson(LAST_EDITOR_STATE_KEY, {
    deckId: safeDeckId,
    slideIndex: sanitizeIndex(slideIndex),
    fileId: typeof fileId === 'string' ? fileId : '',
  });
}

export function getLastPresentationState(deckId) {
  const state = readJson(LAST_PRESENTATION_STATE_KEY, null);
  if (!state || sanitizeDeckId(state.deckId) !== sanitizeDeckId(deckId)) {
    return null;
  }

  return {
    deckId: state.deckId,
    slideIndex: sanitizeIndex(state.slideIndex),
  };
}

export function setLastPresentationState({ deckId, slideIndex }) {
  const safeDeckId = sanitizeDeckId(deckId);
  if (!safeDeckId) return false;
  return writeJson(LAST_PRESENTATION_STATE_KEY, {
    deckId: safeDeckId,
    slideIndex: sanitizeIndex(slideIndex),
  });
}

export function getRecentDecks() {
  const decks = readJson(RECENT_DECKS_KEY, []);
  if (!Array.isArray(decks)) return [];

  return decks
    .map((entry) => ({
      id: sanitizeDeckId(entry?.id),
      title: typeof entry?.title === 'string' ? entry.title : '',
      lastOpenedAt: Number.isFinite(entry?.lastOpenedAt) ? entry.lastOpenedAt : 0,
    }))
    .filter((entry) => entry.id)
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, MAX_RECENT_DECKS);
}

export function recordRecentDeck({ id, title = '' }) {
  const deckId = sanitizeDeckId(id);
  if (!deckId) return false;

  const nextEntry = {
    id: deckId,
    title: typeof title === 'string' ? title : '',
    lastOpenedAt: Date.now(),
  };

  const nextDecks = [nextEntry, ...getRecentDecks().filter((entry) => entry.id !== deckId)].slice(
    0,
    MAX_RECENT_DECKS,
  );

  return writeJson(RECENT_DECKS_KEY, nextDecks);
}

export function getEditorPreferences() {
  const stored = readJson(EDITOR_PREFERENCES_KEY, {});
  return {
    fontSize: Number.isFinite(stored?.fontSize)
      ? Math.min(Math.max(stored.fontSize, 12), 24)
      : DEFAULT_EDITOR_PREFERENCES.fontSize,
    tabSize: Number.isFinite(stored?.tabSize)
      ? Math.min(Math.max(stored.tabSize, 2), 8)
      : DEFAULT_EDITOR_PREFERENCES.tabSize,
    wordWrap: stored?.wordWrap === 'on' ? 'on' : DEFAULT_EDITOR_PREFERENCES.wordWrap,
    lineNumbers: stored?.lineNumbers === 'off' ? 'off' : DEFAULT_EDITOR_PREFERENCES.lineNumbers,
    minimap:
      typeof stored?.minimap === 'boolean' ? stored.minimap : DEFAULT_EDITOR_PREFERENCES.minimap,
    autosave:
      typeof stored?.autosave === 'boolean' ? stored.autosave : DEFAULT_EDITOR_PREFERENCES.autosave,
    autosaveDelay: Number.isFinite(stored?.autosaveDelay)
      ? Math.min(Math.max(stored.autosaveDelay, 500), 5000)
      : DEFAULT_EDITOR_PREFERENCES.autosaveDelay,
  };
}

export function setEditorPreferences(preferences) {
  return writeJson(EDITOR_PREFERENCES_KEY, {
    ...getEditorPreferences(),
    ...preferences,
  });
}

export function getDefaultEditorPreferences() {
  return { ...DEFAULT_EDITOR_PREFERENCES };
}

export function getMermaidDiagramPreference(scope, diagramId) {
  const key = getMermaidPreferenceCompositeKey(scope, diagramId);
  if (!key) return null;

  const preferences = readJson(MERMAID_PREFERENCES_KEY, {});
  const scale = preferences?.[key]?.scale;
  if (!Number.isFinite(scale)) return null;

  return {
    scale: Math.min(Math.max(scale, 0.5), 2.5),
  };
}

export function setMermaidDiagramPreference({ scope, diagramId, scale }) {
  const key = getMermaidPreferenceCompositeKey(scope, diagramId);
  if (!key || !Number.isFinite(scale)) return false;

  const current = readJson(MERMAID_PREFERENCES_KEY, {});
  const next = {
    ...current,
    [key]: {
      scale: Math.min(Math.max(scale, 0.5), 2.5),
      updatedAt: Date.now(),
    },
  };

  const entries = Object.entries(next)
    .filter(([, value]) => Number.isFinite(value?.scale))
    .sort(([, left], [, right]) => (right?.updatedAt || 0) - (left?.updatedAt || 0))
    .slice(0, MAX_MERMAID_PREFERENCES);

  return writeJson(MERMAID_PREFERENCES_KEY, Object.fromEntries(entries));
}

export function clearMermaidDiagramPreference(scope, diagramId) {
  const key = getMermaidPreferenceCompositeKey(scope, diagramId);
  if (!key) return false;

  const current = readJson(MERMAID_PREFERENCES_KEY, {});
  if (!Object.prototype.hasOwnProperty.call(current, key)) {
    return true;
  }

  const next = { ...current };
  delete next[key];
  return writeJson(MERMAID_PREFERENCES_KEY, next);
}
