import { EditorState, Prec } from '@codemirror/state';
import {
  EditorView,
  keymap,
  placeholder,
  drawSelection,
  highlightActiveLine,
} from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import {
  defaultKeymap,
  history,
  historyKeymap,
  insertNewlineAndIndent,
} from '@codemirror/commands';
import { autocompletion } from '@codemirror/autocomplete';

export function getAssetImageTriggerMatch(text, cursor, assets = []) {
  const safeText = typeof text === 'string' ? text : '';
  const safeCursor = Number.isFinite(cursor)
    ? Math.max(0, Math.min(cursor, safeText.length))
    : safeText.length;
  const beforeCursor = safeText.slice(0, safeCursor);
  const lineStart = beforeCursor.lastIndexOf('\n') + 1;
  const activeLine = beforeCursor.slice(lineStart);
  const match = activeLine.match(/!\[[^\]]*\]\((?:asset:\/\/)?([^)]*)$/);
  if (!match) return null;

  const rawQuery = match[1] || '';
  const normalizedQuery = rawQuery;
  const imageAssets = (Array.isArray(assets) ? assets : [])
    .filter((asset) => asset?.path && asset.exists !== false)
    .filter((asset) =>
      String(asset.mimeType || '')
        .toLowerCase()
        .startsWith('image/'),
    );

  const options = imageAssets
    .filter(
      (asset) =>
        !normalizedQuery || asset.path.toLowerCase().includes(normalizedQuery.toLowerCase()),
    )
    .map((asset) => ({
      label: asset.path,
      type: 'text',
      detail: asset.mimeType || 'image',
      apply: `asset://${asset.path}`,
    }));

  if (!options.length) return null;

  return {
    from: safeCursor - rawQuery.length,
    options,
  };
}

function isListMarker(text) {
  return /^(?:[-*+]\s+|\d+[.)]\s+|>\s+|- \[[ xX]\]\s+)/.test(text);
}

export function getListContinuation(text) {
  const taskMatch = text.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/);
  if (taskMatch) {
    const [, indent, bullet, checked, body] = taskMatch;
    if (!body.trim()) return '';
    return `${indent}${bullet} [${checked}] `;
  }

  const bulletMatch = text.match(/^(\s*)([-*+])\s+(.*)$/);
  if (bulletMatch) {
    const [, indent, bullet, body] = bulletMatch;
    if (!body.trim()) return '';
    return `${indent}${bullet} `;
  }

  const orderedMatch = text.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
  if (orderedMatch) {
    const [, indent, rawNumber, delimiter, body] = orderedMatch;
    if (!body.trim()) return '';
    return `${indent}${Number.parseInt(rawNumber, 10) + 1}${delimiter} `;
  }

  const quoteMatch = text.match(/^(\s*>\s+)(.*)$/);
  if (quoteMatch) {
    const [, prefix, body] = quoteMatch;
    if (!body.trim()) return '';
    return prefix;
  }

  return null;
}

function getIndentUnit(lineText) {
  const match = lineText.match(/^(\s+)/);
  if (!match?.[1]) return '  ';
  if (match[1].includes('\t')) return '\t';
  return '  ';
}

function getActiveLineInfo(state) {
  const { from, to } = state.selection.main;
  if (from !== to) return null;

  const line = state.doc.lineAt(from);
  const beforeCursor = line.text.slice(0, from - line.from);
  const afterCursor = line.text.slice(from - line.from);
  return { line, beforeCursor, afterCursor };
}

function insertText(
  view,
  text,
  from = view.state.selection.main.from,
  to = view.state.selection.main.to,
) {
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    scrollIntoView: true,
  });
  return true;
}

function continueMarkdownList(view) {
  const info = getActiveLineInfo(view.state);
  if (!info) return false;

  const { from } = view.state.selection.main;
  const nextState = applyMarkdownEnter(view.state.doc.toString(), from);
  if (!nextState) {
    return insertNewlineAndIndent(view);
  }

  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: nextState.text },
    selection: { anchor: nextState.cursor },
    scrollIntoView: true,
  });
  return true;
}

function indentMarkdownList(view) {
  const info = getActiveLineInfo(view.state);
  if (!info || !isListMarker(info.line.text.trimStart())) return false;

  return insertText(view, getIndentUnit(info.line.text), info.line.from, info.line.from);
}

function outdentMarkdownList(view) {
  const info = getActiveLineInfo(view.state);
  if (!info || !isListMarker(info.line.text.trimStart())) return false;

  const text = info.line.text;
  if (text.startsWith('\t')) {
    view.dispatch({
      changes: { from: info.line.from, to: info.line.from + 1, insert: '' },
      selection: { anchor: Math.max(view.state.selection.main.from - 1, info.line.from) },
      scrollIntoView: true,
    });
    return true;
  }

  if (text.startsWith('  ')) {
    view.dispatch({
      changes: { from: info.line.from, to: info.line.from + 2, insert: '' },
      selection: { anchor: Math.max(view.state.selection.main.from - 2, info.line.from) },
      scrollIntoView: true,
    });
    return true;
  }

  return false;
}

export function applyMarkdownEnter(text, cursor) {
  const safeText = typeof text === 'string' ? text : '';
  const safeCursor = Number.isFinite(cursor)
    ? Math.max(0, Math.min(cursor, safeText.length))
    : safeText.length;
  const lineStart = safeText.lastIndexOf('\n', safeCursor - 1) + 1;
  const lineEndCandidate = safeText.indexOf('\n', safeCursor);
  const lineEnd = lineEndCandidate >= 0 ? lineEndCandidate : safeText.length;
  const lineText = safeText.slice(lineStart, lineEnd);
  const continuation = getListContinuation(lineText);

  if (continuation === null) return null;

  if (continuation === '') {
    const nextValue = `${safeText.slice(0, lineStart)}\n${safeText.slice(lineEnd)}`;
    return { text: nextValue, cursor: lineStart + 1 };
  }

  const nextValue = `${safeText.slice(0, lineEnd)}\n${continuation}${safeText.slice(lineEnd)}`;
  return { text: nextValue, cursor: lineEnd + 1 + continuation.length };
}

export function autoClosePair(open, close) {
  return (view) => {
    const { from, to } = view.state.selection.main;
    const selectedText = view.state.sliceDoc(from, to);
    const insert = `${open}${selectedText}${close}`;
    view.dispatch({
      changes: { from, to, insert },
      selection: selectedText
        ? { anchor: from + open.length, head: from + open.length + selectedText.length }
        : { anchor: from + open.length },
      scrollIntoView: true,
    });
    return true;
  };
}

function buildMarkdownKeymap() {
  return [
    { key: 'Enter', run: continueMarkdownList },
    { key: 'Tab', run: indentMarkdownList },
    { key: 'Shift-Tab', run: outdentMarkdownList },
    { key: '(', run: autoClosePair('(', ')') },
    { key: '[', run: autoClosePair('[', ']') },
    { key: '{', run: autoClosePair('{', '}') },
    { key: '"', run: autoClosePair('"', '"') },
    { key: "'", run: autoClosePair("'", "'") },
    { key: '`', run: autoClosePair('`', '`') },
  ];
}

export function createMarkdownEditor({
  parent,
  initialValue = '',
  placeholderText = '',
  getAssetSuggestions,
  onChange,
} = {}) {
  let applyingExternalValue = false;

  function getClampedSelection(selection, valueLength) {
    const anchor = Math.max(0, Math.min(selection?.anchor ?? 0, valueLength));
    const head = Math.max(0, Math.min(selection?.head ?? anchor, valueLength));
    return { anchor, head };
  }

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: initialValue,
      extensions: [
        history(),
        drawSelection(),
        highlightActiveLine(),
        markdown(),
        placeholder(placeholderText),
        autocompletion({
          activateOnTyping: true,
          override: [
            (context) => {
              const match = getAssetImageTriggerMatch(
                context.state.doc.toString(),
                context.pos,
                typeof getAssetSuggestions === 'function' ? getAssetSuggestions() : [],
              );
              if (!match) return null;

              return {
                from: match.from,
                options: match.options,
                filter: false,
              };
            },
          ],
        }),
        Prec.high(keymap.of(buildMarkdownKeymap())),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': {
            height: '100%',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
          },
          '.cm-scroller': {
            fontFamily: 'var(--font-mono)',
            lineHeight: '1.6',
          },
          '.cm-content': {
            padding: '12px 0',
            caretColor: 'var(--text-primary)',
          },
          '.cm-cursor, .cm-dropCursor': {
            borderLeftColor: 'var(--text-primary)',
          },
          '.cm-cursorLayer': {
            animation: 'steps(1) cm-blink 1.2s infinite',
          },
          '.cm-line': {
            padding: '0 12px',
          },
          '.cm-gutters': {
            backgroundColor: 'transparent',
            borderRight: '1px solid var(--border-subtle)',
            color: 'var(--text-tertiary)',
          },
          '.cm-activeLine': {
            backgroundColor: 'rgba(183, 255, 26, 0.08)',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'rgba(183, 255, 26, 0.08)',
          },
          '&.cm-focused': {
            outline: 'none',
            borderColor: 'var(--accent-primary)',
            boxShadow: '0 0 0 1px rgba(183, 255, 26, 0.22)',
          },
          '.cm-selectionBackground, .cm-content ::selection': {
            backgroundColor: 'rgba(183, 255, 26, 0.24) !important',
          },
          '.cm-placeholder': {
            color: 'var(--text-tertiary)',
            fontStyle: 'normal',
          },
          '.cm-tooltip': {
            border: '1px solid var(--border-default)',
            borderRadius: '10px',
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            boxShadow: '0 18px 40px rgba(0, 0, 0, 0.32)',
            overflow: 'hidden',
          },
          '.cm-tooltip-autocomplete > ul': {
            fontFamily: 'var(--font-mono)',
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            padding: '6px',
          },
          '.cm-tooltip-autocomplete > ul > li': {
            color: 'var(--text-secondary)',
            borderRadius: '8px',
          },
          '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
            backgroundColor: 'rgba(183, 255, 26, 0.16)',
            color: 'var(--text-primary)',
          },
          '.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail': {
            color: 'var(--text-secondary)',
          },
          '.cm-completionLabel': {
            color: 'inherit',
          },
          '.cm-completionDetail': {
            color: 'var(--text-tertiary)',
          },
          '.cm-completionMatchedText': {
            color: 'var(--accent-primary)',
            textDecoration: 'none',
            fontWeight: '700',
          },
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || applyingExternalValue) return;
          onChange?.(update.state.doc.toString());
        }),
      ],
    }),
  });

  return {
    getValue() {
      return view.state.doc.toString();
    },
    setValue(nextValue, { preserveSelection = false } = {}) {
      const value = typeof nextValue === 'string' ? nextValue : '';
      if (value === view.state.doc.toString()) return;
      const currentSelection = view.state.selection.main;
      applyingExternalValue = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        selection: preserveSelection
          ? {
              anchor: Math.min(currentSelection.anchor, value.length),
              head: Math.min(currentSelection.head, value.length),
            }
          : { anchor: 0 },
      });
      applyingExternalValue = false;
    },
    focus() {
      view.focus();
    },
    insertText(text) {
      insertText(view, text);
      view.focus();
    },
    setSelection(anchor, head = anchor) {
      view.dispatch({
        selection: { anchor, head },
        scrollIntoView: true,
      });
    },
    getSelection() {
      const { anchor, head } = view.state.selection.main;
      return { anchor, head };
    },
    getViewState() {
      const { anchor, head } = view.state.selection.main;
      return {
        selection: { anchor, head },
        scrollTop: view.scrollDOM.scrollTop,
        scrollLeft: view.scrollDOM.scrollLeft,
      };
    },
    restoreViewState(nextViewState) {
      if (!nextViewState || typeof nextViewState !== 'object') return;

      const valueLength = view.state.doc.length;
      const selection = getClampedSelection(nextViewState.selection, valueLength);
      view.dispatch({ selection });
      if (Number.isFinite(nextViewState.scrollTop)) {
        view.scrollDOM.scrollTop = nextViewState.scrollTop;
      }
      if (Number.isFinite(nextViewState.scrollLeft)) {
        view.scrollDOM.scrollLeft = nextViewState.scrollLeft;
      }
    },
    destroy() {
      view.destroy();
    },
  };
}
