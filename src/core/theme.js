/**
 * Theme Manager
 * Handles dark/light theme switching with localStorage persistence
 */

const HLJS_THEMES = {
  dark: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark-dimmed.min.css',
  light: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css',
};

function getPreferred() {
  const stored = localStorage.getItem('codestage-theme');
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function apply(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('codestage-theme', theme);

  const hljsLink = document.getElementById('hljs-theme');
  if (hljsLink) hljsLink.href = HLJS_THEMES[theme] || HLJS_THEMES.dark;
}

export const theme = {
  get current() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  },

  get isDark() {
    return this.current !== 'light';
  },

  init() {
    apply(getPreferred());
  },

  toggle() {
    const next = this.current === 'dark' ? 'light' : 'dark';
    apply(next);
    return next;
  },
};
