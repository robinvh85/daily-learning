// E2E tests (plan Phase 7): `npm run test:e2e` builds the web app in `e2e` mode (it talks to the
// emulators), starts the Auth, Firestore and Hosting emulators, and runs Playwright against the
// Hosting emulator, i.e. the same files and firebase.json rewrites as production. The emulators
// start empty and are thrown away after the run. First time on a machine:
// `npx playwright install chromium`; the emulators need Java 21+.
import { defineConfig, devices } from '@playwright/test';

/** Hosting emulator (firebase.json). */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5002';

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
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
});
