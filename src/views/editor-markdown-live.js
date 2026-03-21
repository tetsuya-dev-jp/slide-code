import { getMarkdownBlocks } from '../core/markdown-render.js';
import { renderMarkdownToElement } from '../panes/markdown.js';

function normalizeValue(value) {
  return typeof value === 'string' ? value : '';
}

export function createMarkdownLivePane({
  parent,
  onChange,
  resolveAssetUrl,
  getMermaidPreferenceScope,
  commitDelay = 120,
  renderBlockContent = (element, markdown, { mermaidPreferenceScope } = {}) =>
    renderMarkdownToElement(element, markdown, {
      resolveAssetUrl,
      resetScrollOnRender: false,
      mermaidPreferenceScope,
      emptyStateHtml: '',
    }),
} = {}) {
  let markdown = '';
  let blocks = [];
  let editingBlockIndex = null;
  let editingStartSource = '';
  let editingRangeStart = 0;
  let editingRangeEnd = 0;
  let editingHasFollowingBlock = false;
  let pendingOpenBlockIndex = null;
  let commitTimer = 0;
  let pendingCommit = null;
  let renderRequestId = 0;

  const editorEl = document.createElement('textarea');
  editorEl.className = 'editor-markdown-live-editor';
  editorEl.rows = 1;
  editorEl.spellcheck = false;
  editorEl.setAttribute('aria-label', 'Markdown block editor');

  if (parent instanceof HTMLElement) {
    parent.classList.add('markdown-body', 'editor-markdown-live-surface');
  }

  function resizeEditor() {
    const computedStyle = window.getComputedStyle(editorEl);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 24;
    editorEl.style.height = 'auto';
    editorEl.style.height = `${Math.max(editorEl.scrollHeight, Math.ceil(lineHeight))}px`;
  }

  function getEditableSource(blockIndex) {
    const block = blocks[blockIndex];
    const source = block?.source || '';
    if (!(blockIndex < blocks.length - 1)) {
      return source;
    }

    return source.replace(/\s+$/, '');
  }

  function composeMarkdown(nextSource) {
    if (editingBlockIndex === null) {
      return {
        markdown,
        rangeEnd: editingRangeEnd,
      };
    }

    const currentSource = markdown.slice(editingRangeStart, editingRangeEnd);
    const draftSource = normalizeValue(nextSource);
    const trailingWhitespaceMatch = currentSource.match(/(\s+)$/);
    const shouldPreserveBlockSpacing =
      editingHasFollowingBlock && trailingWhitespaceMatch?.[1] && !/\s$/.test(draftSource);
    const finalizedSource = shouldPreserveBlockSpacing
      ? `${draftSource}${trailingWhitespaceMatch[1]}`
      : draftSource;

    return {
      markdown: `${markdown.slice(0, editingRangeStart)}${finalizedSource}${markdown.slice(editingRangeEnd)}`,
      rangeEnd: editingRangeStart + finalizedSource.length,
    };
  }

  function clearPendingCommit() {
    if (commitTimer) {
      window.clearTimeout(commitTimer);
      commitTimer = 0;
    }
    pendingCommit = null;
  }

  function emitChange(nextCommit) {
    clearPendingCommit();
    const nextMarkdown = nextCommit?.markdown ?? markdown;
    if (nextMarkdown === markdown) {
      return markdown;
    }

    markdown = nextMarkdown;
    if (editingBlockIndex !== null && typeof nextCommit?.rangeEnd === 'number') {
      editingRangeEnd = nextCommit.rangeEnd;
    }
    onChange?.(markdown);
    return markdown;
  }

  function scheduleCommit() {
    const nextCommit = composeMarkdown(editorEl.value);
    pendingCommit = nextCommit;
    if (commitTimer) {
      window.clearTimeout(commitTimer);
    }
    commitTimer = window.setTimeout(() => {
      const valueToCommit = pendingCommit;
      clearPendingCommit();
      if (valueToCommit?.markdown) {
        emitChange(valueToCommit);
      }
    }, commitDelay);
  }

  async function finishEditing({ nextBlockIndex = null, revert = false } = {}) {
    if (editingBlockIndex === null) {
      return markdown;
    }

    const nextCommit = revert
      ? composeMarkdown(editingStartSource)
      : composeMarkdown(editorEl.value);
    emitChange(nextCommit);
    blocks = getMarkdownBlocks(markdown);
    editingBlockIndex = Number.isInteger(nextBlockIndex) ? nextBlockIndex : null;
    pendingOpenBlockIndex = null;
    if (editingBlockIndex !== null) {
      editingStartSource = getEditableSource(editingBlockIndex);
      editingRangeStart = blocks[editingBlockIndex]?.start || 0;
      editingRangeEnd = blocks[editingBlockIndex]?.end || editingRangeStart;
      editingHasFollowingBlock = editingBlockIndex < blocks.length - 1;
      editorEl.value = editingStartSource;
      resizeEditor();
    } else {
      editingStartSource = '';
      editingRangeStart = 0;
      editingRangeEnd = 0;
      editingHasFollowingBlock = false;
    }
    await render();
    return markdown;
  }

  function activateBlock(blockIndex) {
    editingBlockIndex = blockIndex;
    editingStartSource = getEditableSource(blockIndex);
    editingRangeStart = blocks[blockIndex]?.start || 0;
    editingRangeEnd = blocks[blockIndex]?.end || editingRangeStart;
    editingHasFollowingBlock = blockIndex < blocks.length - 1;
    editorEl.value = editingStartSource;
    resizeEditor();
    render().catch(() => {});
  }

  async function render() {
    if (!(parent instanceof HTMLElement)) {
      return;
    }

    const requestId = ++renderRequestId;
    const previousScrollTop = parent.scrollTop;
    blocks = getMarkdownBlocks(markdown);

    if (!blocks.length) {
      parent.innerHTML = `
        <div class="editor-markdown-live-empty">
          <p>このスライドには解説がありません</p>
          <p>Markdown モードで入力するか、既存ブロックを追加してから LIVE で整えてください。</p>
        </div>
      `;
      return;
    }

    parent.replaceChildren();

    for (const [blockIndex, block] of blocks.entries()) {
      const blockEl = document.createElement('div');
      blockEl.className = 'editor-markdown-live-fragment';
      blockEl.dataset.markdownBlockIndex = String(blockIndex);
      blockEl.dataset.blockKind = block.kind;
      if (typeof block.headingDepth === 'number') {
        blockEl.dataset.headingDepth = String(block.headingDepth);
      }
      blockEl.tabIndex = editingBlockIndex === null ? 0 : -1;

      if (editingBlockIndex === blockIndex) {
        blockEl.dataset.editing = 'true';
        const editorWrapEl = document.createElement('div');
        editorWrapEl.className = 'editor-markdown-live-editor-wrap';
        editorWrapEl.append(editorEl);
        blockEl.append(editorWrapEl);
      } else {
        const contentEl = document.createElement('div');
        contentEl.className = 'editor-markdown-live-content';
        blockEl.append(contentEl);
        parent.append(blockEl);
        await renderBlockContent(contentEl, block.source, {
          mermaidPreferenceScope:
            typeof getMermaidPreferenceScope === 'function'
              ? getMermaidPreferenceScope(blockIndex)
              : '',
        });

        if (requestId !== renderRequestId) {
          return;
        }

        blockEl.addEventListener('keydown', (event) => {
          if (editingBlockIndex !== null) {
            return;
          }
          if (event.key !== 'Enter' && event.key !== ' ') {
            return;
          }
          event.preventDefault();
          activateBlock(blockIndex);
        });
        continue;
      }

      parent.append(blockEl);
    }

    parent.scrollTop = previousScrollTop;
    if (editingBlockIndex !== null) {
      editorEl.focus();
      editorEl.setSelectionRange(editorEl.value.length, editorEl.value.length);
      resizeEditor();
    }
  }

  editorEl.addEventListener('input', () => {
    resizeEditor();
    scheduleCommit();
  });
  editorEl.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finishEditing({ revert: true }).catch(() => {});
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      finishEditing().catch(() => {});
    }
  });
  editorEl.addEventListener('blur', () => {
    window.setTimeout(() => {
      if (editingBlockIndex === null) {
        return;
      }
      if (document.activeElement === editorEl) {
        return;
      }
      finishEditing({ nextBlockIndex: pendingOpenBlockIndex }).catch(() => {});
    }, 0);
  });
  parent?.addEventListener(
    'mousedown',
    (event) => {
      const nextBlock =
        event.target instanceof HTMLElement
          ? event.target.closest('[data-markdown-block-index]')
          : null;
      pendingOpenBlockIndex = nextBlock
        ? Number.parseInt(nextBlock.dataset.markdownBlockIndex || '', 10)
        : null;
    },
    true,
  );
  parent?.addEventListener('click', (event) => {
    const nextBlock =
      event.target instanceof HTMLElement
        ? event.target.closest('[data-markdown-block-index]')
        : null;
    if (!(nextBlock instanceof HTMLElement)) {
      return;
    }
    const nextIndex = Number.parseInt(nextBlock.dataset.markdownBlockIndex || '', 10);
    if (!Number.isInteger(nextIndex)) {
      return;
    }
    if (editingBlockIndex === null) {
      activateBlock(nextIndex);
      return;
    }
    if (editingBlockIndex !== nextIndex) {
      pendingOpenBlockIndex = nextIndex;
      finishEditing({ nextBlockIndex: nextIndex }).catch(() => {});
    }
  });

  return {
    async setValue(nextValue) {
      clearPendingCommit();
      markdown = normalizeValue(nextValue);
      editingBlockIndex = null;
      editingStartSource = '';
      editingRangeStart = 0;
      editingRangeEnd = 0;
      editingHasFollowingBlock = false;
      pendingOpenBlockIndex = null;
      await render();
    },
    getValue() {
      return markdown;
    },
    getDraftValue() {
      if (editingBlockIndex === null) {
        return markdown;
      }

      return composeMarkdown(editorEl.value).markdown;
    },
    async commitPendingDraft() {
      return finishEditing();
    },
    async refresh() {
      await render();
    },
    focus() {
      const firstBlock = parent?.querySelector('[data-markdown-block-index]');
      if (firstBlock instanceof HTMLElement) {
        firstBlock.focus();
      }
    },
    destroy() {
      if (parent instanceof HTMLElement) {
        parent.replaceChildren();
      }
      clearPendingCommit();
      blocks = [];
      markdown = '';
      editingBlockIndex = null;
      editingStartSource = '';
      editingRangeStart = 0;
      editingRangeEnd = 0;
      editingHasFollowingBlock = false;
      pendingOpenBlockIndex = null;
    },
  };
}
