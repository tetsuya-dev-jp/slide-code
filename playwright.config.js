import { defineConfig, devices } from '@playwright/test';

const e2eEnv = {
  XDG_CONFIG_HOME: '.tmp/e2e/xdg-config',
  XDG_DATA_HOME: '.tmp/e2e/xdg-data',
  DECKS_DIR: '.tmp/e2e/decks',
  TEMPLATES_DIR: '.tmp/e2e/templates',
  API_PORT: '3000',
  TERMINAL_WS_PORT: '3001',
  TERMINAL_ENABLED: 'false',
};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      name: 'api',
      command: 'pnpm dev:terminal',
      url: 'http://127.0.0.1:3000/api/config',
      reuseExistingServer: !process.env.CI,
      env: e2eEnv,
      stdout: 'pipe',
      timeout: 120 * 1000,
    },
    {
      name: 'vite',
      command: 'pnpm dev:vite -- --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      timeout: 120 * 1000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
