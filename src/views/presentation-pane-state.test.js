import { describe, expect, test } from 'vitest';
import {
  applyPaneToggle,
  createPanePreferences,
  getSlidePaneDefaults,
  resolvePaneVisibility,
} from './presentation-pane-state.js';
import { LayoutManager } from '../core/layout.js';

describe('presentation pane state', () => {
  test('derives default visibility from slide content', () => {
    expect(getSlidePaneDefaults({ markdown: 'notes' }, { code: 'print(1)' })).toEqual({
      code: true,
      shell: true,
      markdown: true,
    });

    expect(getSlidePaneDefaults({ markdown: 'notes' }, { code: '' })).toEqual({
      code: false,
      shell: false,
      markdown: true,
    });
  });

  test('preserves manual pane preferences across slide defaults', () => {
    const preferences = createPanePreferences();
    const codeSlideDefaults = { code: true, shell: true, markdown: false };
    const currentVisibility = resolvePaneVisibility(preferences, codeSlideDefaults);

    const toggled = applyPaneToggle({
      pane: 'shell',
      preferences,
      visibility: currentVisibility,
      defaults: codeSlideDefaults,
    });

    expect(toggled.allowed).toBe(true);
    expect(toggled.preferences.shell).toBe(false);
    expect(toggled.visibility).toEqual({ code: true, shell: false, markdown: false });

    const markdownOnlyDefaults = { code: false, shell: false, markdown: true };
    expect(resolvePaneVisibility(toggled.preferences, markdownOnlyDefaults)).toEqual({
      code: false,
      shell: false,
      markdown: true,
    });

    expect(resolvePaneVisibility(toggled.preferences, codeSlideDefaults)).toEqual({
      code: true,
      shell: false,
      markdown: false,
    });
  });

  test('does not allow hiding the last visible pane', () => {
    const defaults = { code: false, shell: false, markdown: true };
    const visibility = resolvePaneVisibility(createPanePreferences(), defaults);

    const toggled = applyPaneToggle({
      pane: 'markdown',
      preferences: createPanePreferences(),
      visibility,
      defaults,
    });

    expect(toggled.allowed).toBe(false);
    expect(toggled.visibility).toEqual(visibility);
  });

  test('moves panes left and right without drag and drop', () => {
    const contentEl = document.createElement('div');
    const manager = new LayoutManager(contentEl);

    expect(manager.paneOrder).toEqual(['code', 'shell', 'markdown']);
    expect(manager.movePaneByName('shell', 'prev')).toBe(true);
    expect(manager.paneOrder).toEqual(['shell', 'code', 'markdown']);
    expect(manager.movePaneByName('markdown', 'next')).toBe(false);
    expect(manager.paneOrder).toEqual(['shell', 'code', 'markdown']);
  });
});
