import { describe, expect, test } from 'vitest';
import { applyMarkdownEnter, autoClosePair, getListContinuation } from './editor-markdown-editor.js';

describe('editor markdown helpers', () => {
  test('continues common markdown list markers', () => {
    expect(getListContinuation('- item')).toBe('- ');
    expect(getListContinuation('  * item')).toBe('  * ');
    expect(getListContinuation('1. item')).toBe('2. ');
    expect(getListContinuation('> quote')).toBe('> ');
    expect(getListContinuation('- [ ] task')).toBe('- [ ] ');
  });

  test('ends list when the current marker is empty', () => {
    expect(getListContinuation('- ')).toBe('');
    expect(getListContinuation('> ')).toBe('');
    expect(getListContinuation('- [ ] ')).toBe('');
  });

  test('applies enter behavior for list continuation and list exit', () => {
    expect(applyMarkdownEnter('- item', 6)).toEqual({ text: '- item\n- ', cursor: 9 });
    expect(applyMarkdownEnter('- ', 2)).toEqual({ text: '\n', cursor: 1 });
  });

  test('wraps selected text with matching brackets', () => {
    const dispatched = [];
    const command = autoClosePair('(', ')');
    const view = {
      state: {
        selection: { main: { from: 0, to: 5 } },
        sliceDoc(from, to) {
          return 'hello'.slice(from, to);
        },
      },
      dispatch(payload) {
        dispatched.push(payload);
      },
    };

    expect(command(view)).toBe(true);
    expect(dispatched[0]).toMatchObject({
      changes: { from: 0, to: 5, insert: '(hello)' },
      selection: { anchor: 1, head: 6 },
    });
  });
});
