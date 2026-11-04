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
  // The Angular dev proxy appends its loopback hop to the synthetic browser address.
  TRUST_PROXY: 'true',
  TRUSTED_PROXY_HOPS: '2',
  CAPTCHA_LOGIN_PROVIDER: 'internal',
  CAPTCHA_PASSWORD_CHANGE_PROVIDER: 'turnstile',
  CAPTCHA_HMAC_SECRET: 'e2e-only-internal-captcha-hmac-secret',
  CAPTCHA_TEST_MODE: 'true',
  TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
  CAPTCHA_EXPECTED_HOSTNAME: 'localhost',
  TURNSTILE_VERIFY_URL: 'http://127.0.0.1:3100/siteverify',
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
      command: 'node --experimental-strip-types tests/e2e/turnstile-stub.ts',
      cwd: root,
      url: 'http://127.0.0.1:3100/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
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
