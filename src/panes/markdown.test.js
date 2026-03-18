import { describe, expect, test } from 'vitest';
import { MarkdownPane, normalizeMermaidSvg } from './markdown.js';

describe('MarkdownPane', () => {
  test('reuses existing image nodes across markdown updates', async () => {
    const container = document.createElement('div');
    const pane = new MarkdownPane(container, {
      resolveAssetUrl: (assetPath) => `/assets/${assetPath}`,
    });

    await pane.render('![Diagram](asset://diagram.png)');
    const firstImage = container.querySelector('img');

    await pane.render('updated text\n\n![Diagram](asset://diagram.png)');
    const secondImage = container.querySelector('img');

    expect(firstImage).toBeTruthy();
    expect(secondImage).toBe(firstImage);
    expect(container.textContent).toContain('updated text');
  });

  test('replaces image nodes when asset source changes', async () => {
    const container = document.createElement('div');
    const pane = new MarkdownPane(container, {
      resolveAssetUrl: (assetPath) => `/assets/${assetPath}`,
    });

    await pane.render('![Diagram](asset://diagram-a.png)');
    const firstImage = container.querySelector('img');

    await pane.render('![Diagram](asset://diagram-b.png)');
    const secondImage = container.querySelector('img');

    expect(secondImage).toBeTruthy();
    expect(secondImage).not.toBe(firstImage);
    expect(secondImage?.getAttribute('src')).toBe('/assets/diagram-b.png');
  });

  test('preserves scroll position when configured for editor previews', async () => {
    const container = document.createElement('div');
    const pane = new MarkdownPane(container, {
      resolveAssetUrl: (assetPath) => `/assets/${assetPath}`,
      resetScrollOnRender: false,
    });

    await pane.render('![Diagram](asset://diagram.png)');
    container.scrollTop = 180;

    await pane.render('updated text\n\n![Diagram](asset://diagram.png)');

    expect(container.scrollTop).toBe(180);
  });

  test('normalizes rendered mermaid svg sizing attributes', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const output = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    output.classList.add('output');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '640');
    svg.append(output);

    Object.defineProperty(output, 'getBBox', {
      value: () => ({ x: 12, y: 24, width: 180, height: 360 }),
    });

    normalizeMermaidSvg(svg);

    expect(svg.hasAttribute('width')).toBe(false);
    expect(svg.hasAttribute('height')).toBe(false);
    expect(svg.dataset.mermaidLayout).toBe('tall');
    expect(svg.getAttribute('viewBox')).toBe('-4 8 212 392');
    expect(svg.style.getPropertyValue('--mermaid-target-width')).toBe('340px');
    expect(svg.style.height).toBe('auto');
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMin meet');
  });
});
