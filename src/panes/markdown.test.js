import { describe, expect, test } from 'vitest';
import { MarkdownPane } from './markdown.js';

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
});
