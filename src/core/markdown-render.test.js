import { describe, expect, test } from 'vitest';
import { renderMarkdownDocument } from './markdown-render.js';

describe('renderMarkdownDocument', () => {
  test('renders markdown structure, callouts, math, assets, and mermaid placeholders', () => {
    const { html, hasMermaid } = renderMarkdownDocument(`# Heading

> [!NOTE]
> hello **world**

Inline $a+b$.

$$
c+d
$$

![Diagram](asset://diagram.png)







\`\`\`mermaid
graph TD
A-->B
\`\`\`
`, {
      resolveAssetUrl: (assetPath) => `assets/${assetPath}`,
      mermaidIdPrefix: 'test-mermaid',
    });

    expect(html).toContain('<h1>Heading</h1>');
    expect(html).toContain('class="callout callout-info"');
    expect(html).toContain('<strong>NOTE</strong>');
    expect(html).toContain('class="katex"');
    expect(html).toContain('src="assets/diagram.png"');
    expect(html).toContain('class="mermaid"');
    expect(hasMermaid).toBe(true);
  });

  test('escapes raw html and strips unsafe link targets', () => {
    const { html } = renderMarkdownDocument('<script>alert(1)</script>\n\n[bad](javascript:alert(1))');

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:alert(1)"');
  });
});
