import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

const sharedRules = {
  'no-undef': 'error',
  'no-unreachable': 'error',
  'no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    },
  ],
};

export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.tmp/**',
      'node_modules/**',
    ],
  },
  {
    ...js.configs.recommended,
    files: ['*.js', 'src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...sharedRules,
    },
  },
  {
    ...js.configs.recommended,
    files: [
      'server/**/*.js',
      'tests/**/*.js',
      '*.config.js',
      'playwright.config.js',
      'vitest.config.js',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...sharedRules,
    },
  },
  prettierConfig,
];
