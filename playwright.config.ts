import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const root = path.resolve(import.meta.dirname);
const databasePath = path.join(root, 'data', 'securedesk.e2e.sqlite');
const commonEnv = {
  ...process.env,
  APP_ORIGIN: 'http://localhost:4200',
  E2E_DATABASE_PATH: databasePath,
  CSRF_SECRET: 'e2e-only-csrf-secret-with-at-least-32-bytes',
  TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString('base64'),
  COOKIE_SECURE: 'false',
  TRUST_PROXY: 'false',
};

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  outputDir: './.local/playwright',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: '.local/playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: 'npm run dev -w apps/backend',
      cwd: root,
      env: { ...commonEnv, NODE_ENV: 'development' },
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run start -w apps/frontend',
      cwd: root,
      env: commonEnv,
      url: 'http://localhost:4200',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
