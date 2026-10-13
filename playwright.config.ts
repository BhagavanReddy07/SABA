import { defineConfig, devices } from '@playwright/test';

// Browser smoke test. Runs against E2E_BASE_URL when set; otherwise starts the production
// build on :3000 (CI builds first, so `next start` is enough there).
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: external ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: external
    ? undefined
    : {
        command: process.env.CI ? 'npm start' : 'npm run build && npm start',
        url: 'http://localhost:3000',
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
      },
});
