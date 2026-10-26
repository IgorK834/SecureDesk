import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_DATABASE_PATH, EVIDENCE_DIR } from './helpers';

test('the isolated database stores Argon2id hashes, never plaintext passwords', async ({
  page,
}) => {
  const output = execFileSync('bash', ['scripts/show-hashes.sh', E2E_DATABASE_PATH], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
  });

  expect(output).toContain('$argon2id$v=19$');
  expect(output).toContain('...');
  await page.setContent(`
    <main style="background:#101418;color:#d6f5d6;min-height:100vh;padding:48px;font:18px ui-monospace,monospace">
      <h1 style="font:28px system-ui;color:white">Database hash inspection</h1>
      <pre style="white-space:pre-wrap">${output.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>
    </main>
  `);
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, '03-hash-in-database.png'),
    fullPage: true,
  });
});
