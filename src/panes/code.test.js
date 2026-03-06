import { describe, expect, test } from 'vitest';
import hljs from 'highlight.js';
import { CodePane } from './code.js';
import { splitHighlightedHtmlLines } from './highlighted-lines.js';

describe('splitHighlightedHtmlLines', () => {
  test('keeps multiline string markup balanced across lines', () => {
    const highlighted = hljs.highlight('const s = `a\nb`;', { language: 'javascript' }).value;
    const lines = splitHighlightedHtmlLines(highlighted);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('<span class="hljs-string">');
    expect(lines[0]).toContain('`a');
    expect(lines[0]).toContain('</span>');
    expect(lines[1]).toContain('<span class="hljs-string">');
    expect(lines[1]).toContain('b`</span>');
  });

  test('keeps multiline comment markup balanced when siblings follow', () => {
    const highlighted = hljs.highlight('/* a\nb */\nconst x = 1;', { language: 'javascript' }).value;
    const lines = splitHighlightedHtmlLines(highlighted);

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('<span class="hljs-comment">/* a</span>');
    expect(lines[1]).toContain('<span class="hljs-comment">b */</span>');
    expect(lines[2]).toContain('<span class="hljs-keyword">const</span>');
  });
});

describe('CodePane', () => {
  test('renders multiline highlighted code into stable line rows', () => {
    const codeBody = document.createElement('div');
    const langBadge = document.createElement('span');
    const copyBtn = document.createElement('button');
    const pane = new CodePane(codeBody, langBadge, copyBtn);

    pane.render('const s = `a\nb`;', 'javascript', [2]);

    const lineEls = Array.from(codeBody.querySelectorAll('.code-line'));
    expect(lineEls).toHaveLength(2);
    expect(lineEls[0].querySelector('.line-content')?.innerHTML).toContain('<span class="hljs-string">');
    expect(lineEls[1].querySelector('.line-content')?.innerHTML).toContain('<span class="hljs-string">');
    expect(lineEls[1].classList.contains('line-highlight')).toBe(true);
  });
});
