// E2E tests (plan Phase 7): `npm run test:e2e` builds the app, then Playwright starts the built
// server on its own port with a throwaway database, so the real `data/app.db` is never touched.
// First time on a machine: `npx playwright install chromium`.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;
/** Relative to the repo root; `tmp/` is git-ignored. Deleted before every run. */
const E2E_DIR = 'tmp/e2e';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Fresh DB each run; the server migrates it and auto-syncs content/ on start.
    command: `node -e "require('fs').rmSync('${E2E_DIR}',{recursive:true,force:true})" && npm start`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    env: {
      HOST: '127.0.0.1',
      PORT: String(PORT),
      DB_PATH: `./${E2E_DIR}/app.db`,
      AUTH_MODE: 'none',
      USER_DISPLAY_NAME: 'E2E',
    },
  },
});
