import katex from 'katex';
import { Marked } from 'marked';

export const EXPORT_KATEX_STYLESHEET_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.33/dist/katex.min.css';
export const EXPORT_MERMAID_MODULE_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

const CALLOUT_CLASS_MAP = {
  NOTE: 'callout-info',
  TIP: 'callout-tip',
  IMPORTANT: 'callout-info',
  WARNING: 'callout-warn',
  CAUTION: 'callout-warn',
};

const MARKED_OPTIONS = {
  gfm: true,
  breaks: true,
};

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveAssetReference(value, resolveAssetUrl) {
  const text = typeof value === 'string' ? value : '';
  if (!text.includes('asset://') || typeof resolveAssetUrl !== 'function') {
    return text;
  }

  return text.replace(/asset:\/\/([^\s)"'`<>]+)/g, (match, assetPath) => {
    try {
      const resolved = resolveAssetUrl(assetPath);
      return typeof resolved === 'string' && resolved ? resolved : match;
    } catch {
      return match;
    }
  });
}

function sanitizeUrl(url, { allowRelative = true, allowDataImage = true } = {}) {
    const normalized = typeof url === 'string' ? url.trim() : '';
    if (!normalized) return '';
    if (normalized.startsWith('#')) return normalized;
    if (normalized.startsWith('//')) return '';

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(normalized);
  if (!hasScheme) {
    return allowRelative ? normalized : '';
  }

  const scheme = normalized.slice(0, normalized.indexOf(':')).toLowerCase();
  if (scheme === 'http' || scheme === 'https' || scheme === 'mailto' || scheme === 'tel') {
    return normalized;
  }
  if (allowDataImage && scheme === 'data' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(normalized)) {
    return normalized;
  }

    return '';
}

function renderKatex(tex, displayMode) {
  try {
    return katex.renderToString(tex.trim(), { displayMode, throwOnError: false });
  } catch {
    return displayMode
      ? `<div class="katex-error">${escapeHtml(tex)}</div>`
      : escapeHtml(tex);
  }
}

function createMathExtensions() {
  return [
    {
      name: 'blockMath',
      level: 'block',
      start(src) {
        const match = src.match(/^\$\$/m);
        return match?.index;
      },
      tokenizer(src) {
        const match = src.match(/^\$\$\n?([\s\S]+?)\n?\$\$(?:\n|$)/);
        if (!match) return false;
        return {
          type: 'blockMath',
          raw: match[0],
          text: match[1],
        };
      },
      renderer(token) {
        return renderKatex(token.text, true);
      },
    },
    {
      name: 'inlineMath',
      level: 'inline',
      start(src) {
        const index = src.indexOf('$');
        return index >= 0 ? index : undefined;
      },
      tokenizer(src) {
        if (src.startsWith('$$')) return false;
        const match = src.match(/^\$((?:\\\$|[^$\n])+?)\$/);
        if (!match) return false;
        return {
          type: 'inlineMath',
          raw: match[0],
          text: match[1],
        };
      },
      renderer(token) {
        return renderKatex(token.text, false);
      },
    },
  ];
}

export function renderMarkdownDocument(markdownText, { resolveAssetUrl, mermaidIdPrefix = 'mermaid' } = {}) {
  const parser = new Marked(MARKED_OPTIONS);
  let mermaidCount = 0;

  parser.use({
    extensions: createMathExtensions(),
    walkTokens(token) {
      if (token.type === 'text') {
        token.text = resolveAssetReference(token.text, resolveAssetUrl);
        if (typeof token.raw === 'string') {
          token.raw = resolveAssetReference(token.raw, resolveAssetUrl);
        }
      }

      if ((token.type === 'link' || token.type === 'image') && typeof token.href === 'string') {
        token.href = resolveAssetReference(token.href, resolveAssetUrl);
      }
    },
    renderer: {
      html(token) {
        return escapeHtml(token.raw || token.text || '');
      },
      code(token) {
        const language = typeof token.lang === 'string' ? token.lang.trim() : '';
        if (language.toLowerCase() === 'mermaid') {
          const id = `${mermaidIdPrefix}-${mermaidCount++}`;
          return `<div class="mermaid" id="${escapeHtml(id)}">${escapeHtml(token.text || '')}</div>`;
        }

        const languageClass = language ? ` class="language-${escapeHtml(language)}"` : '';
        return `<pre><code${languageClass}>${escapeHtml(token.text || '')}</code></pre>`;
      },
      blockquote(token) {
        const calloutMatch = String(token.text || '').trimStart().match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*\n+)?([\s\S]*)$/i);
        if (!calloutMatch) {
          return `<blockquote>${this.parser.parse(token.tokens)}</blockquote>`;
        }

        const type = calloutMatch[1].toUpperCase();
        const bodyMarkdown = calloutMatch[2].trim();
        const bodyHtml = bodyMarkdown ? parser.parse(bodyMarkdown) : '';
        const className = CALLOUT_CLASS_MAP[type] || 'callout-info';
        return `<div class="callout ${className}"><strong>${type}</strong>${bodyHtml}</div>`;
      },
      link(token) {
        const href = sanitizeUrl(token.href);
        const text = this.parser.parseInline(token.tokens);
        if (!href) return text;
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
        return `<a href="${escapeHtml(href)}"${title}>${text}</a>`;
      },
      image(token) {
        const src = sanitizeUrl(token.href, { allowRelative: true, allowDataImage: true });
        if (!src) return escapeHtml(token.text || '');
        const alt = escapeHtml(token.text || '');
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
        return `<img src="${escapeHtml(src)}" alt="${alt}"${title} />`;
      },
    },
  });

  const html = parser.parse(typeof markdownText === 'string' ? markdownText : '');

  return {
    html,
    hasMermaid: mermaidCount > 0,
  };
}
