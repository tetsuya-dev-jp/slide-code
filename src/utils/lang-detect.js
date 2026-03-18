/**
 * Language detection from file extensions and Monaco language ID mapping
 */

const EXT_LANG_MAP = {
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  jsx: 'javascript',
  tsx: 'typescript',
  html: 'html',
  css: 'css',
  json: 'json',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  sh: 'bash',
  sql: 'sql',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  r: 'r',
  scala: 'scala',
  lua: 'lua',
  pl: 'perl',
  ex: 'elixir',
  exs: 'elixir',
  hs: 'haskell',
  ml: 'ocaml',
  clj: 'clojure',
  dart: 'dart',
  vue: 'html',
  svelte: 'html',
};

export function detectLanguage(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return EXT_LANG_MAP[ext] || 'plaintext';
}

const MONACO_LANG_MAP = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  go: 'go',
  rust: 'rust',
  ruby: 'ruby',
  php: 'php',
  swift: 'swift',
  kotlin: 'kotlin',
  bash: 'shell',
  sh: 'shell',
  sql: 'sql',
  html: 'html',
  css: 'css',
  json: 'json',
  yaml: 'yaml',
  toml: 'ini',
  xml: 'xml',
  markdown: 'markdown',
  plaintext: 'plaintext',
};

export function monacoLangId(lang) {
  return MONACO_LANG_MAP[lang] || 'plaintext';
}
