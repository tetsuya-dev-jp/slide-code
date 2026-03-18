import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.js', 'server/**/*.test.js'],
    environment: 'jsdom',
    environmentMatchGlobs: [['server/**/*.test.js', 'node']],
  },
});
