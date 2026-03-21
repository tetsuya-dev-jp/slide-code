import { describe, expect, test, vi } from 'vitest';
import { createMarkdownLivePane } from './editor-markdown-live.js';

async function flushTasks() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe('createMarkdownLivePane', () => {
  test('saves only the active block and emits updated markdown', async () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    const pane = createMarkdownLivePane({
      parent: container,
      commitDelay: 0,
      onChange,
      renderBlockContent: async (element, markdown) => {
        element.textContent = markdown;
      },
    });

    await pane.setValue('# Title\n\nParagraph text');
    const blocks = container.querySelectorAll('[data-markdown-block-index]');
    expect(blocks).toHaveLength(2);
    expect(container.textContent).not.toContain('クリックして編集');
    expect(container.textContent).not.toContain('HEADING');

    blocks[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushTasks();

    const textarea = container.querySelector('.editor-markdown-live-editor');
    expect(textarea).toBeTruthy();
    expect(container.querySelector('button')).toBeNull();
    textarea.value = 'Updated paragraph';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushTasks();

    expect(onChange).toHaveBeenCalledWith('# Title\n\nUpdated paragraph');
    expect(container.querySelector('.editor-markdown-live-editor')).toBeTruthy();
  });

  test('cancels inline editing with escape', async () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    const pane = createMarkdownLivePane({
      parent: container,
      commitDelay: 0,
      onChange,
      renderBlockContent: async (element, markdown) => {
        element.textContent = markdown;
      },
    });

    await pane.setValue('Paragraph text');
    container
      .querySelector('[data-markdown-block-index]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushTasks();

    const textarea = container.querySelector('.editor-markdown-live-editor');
    textarea.value = 'Discarded draft';
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushTasks();

    expect(onChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Paragraph text');
    expect(container.textContent).not.toContain('Discarded draft');
  });

  test('commits the current block when switching to another block', async () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    const pane = createMarkdownLivePane({
      parent: container,
      commitDelay: 0,
      onChange,
      renderBlockContent: async (element, markdown) => {
        element.textContent = markdown;
      },
    });

    await pane.setValue('First block\n\nSecond block');
    container
      .querySelector('[data-markdown-block-index]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushTasks();

    const textarea = container.querySelector('.editor-markdown-live-editor');
    textarea.value = 'Updated first block';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const nextBlock = container.querySelectorAll('[data-markdown-block-index]')[1];
    nextBlock.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    nextBlock.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushTasks();

    expect(onChange).toHaveBeenCalledWith('Updated first block\n\nSecond block');
    expect(pane.getValue()).toBe('Updated first block\n\nSecond block');
    expect(container.querySelector('.editor-markdown-live-editor')?.value).toBe('Second block');
  });

  test('keeps replacing the same inline range across repeated commits', async () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    const pane = createMarkdownLivePane({
      parent: container,
      commitDelay: 0,
      onChange,
      renderBlockContent: async (element, markdown) => {
        element.textContent = markdown;
      },
    });

    await pane.setValue('First block\n\nSecond block');
    container
      .querySelector('[data-markdown-block-index]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushTasks();

    const textarea = container.querySelector('.editor-markdown-live-editor');
    textarea.value = 'First block updated once';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushTasks();

    textarea.value = 'First block updated twice';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushTasks();

    expect(onChange).toHaveBeenLastCalledWith('First block updated twice\n\nSecond block');
    expect(pane.getValue()).toBe('First block updated twice\n\nSecond block');
  });

  test('renders as a continuous document without block chrome', async () => {
    const container = document.createElement('div');
    const pane = createMarkdownLivePane({
      parent: container,
      commitDelay: 0,
      renderBlockContent: async (element, markdown) => {
        element.innerHTML = markdown.startsWith('# ')
          ? `<h1>${markdown.slice(2)}</h1>`
          : `<p>${markdown}</p>`;
      },
    });

    await pane.setValue('# Title\n\nParagraph text');

    expect(container.querySelector('.editor-markdown-live-block')).toBeNull();
    expect(container.querySelector('.editor-markdown-live-block-kind')).toBeNull();
    expect(container.querySelector('h1')).toBeTruthy();
    expect(container.querySelector('p')).toBeTruthy();
  });

  test('opens heading source without trailing separator lines', async () => {
    const container = document.createElement('div');
    const pane = createMarkdownLivePane({
      parent: container,
      commitDelay: 0,
      renderBlockContent: async (element, markdown) => {
        element.textContent = markdown;
      },
    });

    await pane.setValue('# Title\n\nParagraph text');
    container
      .querySelector('[data-markdown-block-index]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushTasks();

    expect(container.querySelector('.editor-markdown-live-editor')?.value).toBe('# Title');
  });
});
