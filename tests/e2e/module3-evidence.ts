import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { createDb } from '../../apps/backend/src/server/db/connection';
import { E2E_DATABASE_PATH } from './helpers';

export function disposableDatabase(): string {
  const directory = process.env.SECUREDESK_E2E_DIR;
  if (!directory) throw new Error('Module 3 evidence requires an isolated test run.');
  const physical = realpathSync(directory);
  const underTemp = [tmpdir(), '/tmp'].some((root) => {
    const relative = path.relative(realpathSync(root), physical);
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  });
  if (!underTemp) {
    throw new Error(
      'The evidence database must be in a disposable directory under the system temp path.',
    );
  }
  const filename = realpathSync(E2E_DATABASE_PATH);
  if (filename !== path.join(physical, 'securedesk.e2e.sqlite')) {
    throw new Error('The evidence database must be the fixture created by browser setup.');
  }
  return filename;
}

export function auditTableFragment(): string {
  return execFileSync('sh', ['scripts/show-audit-table.sh', disposableDatabase()], {
    encoding: 'utf8',
  })
    .trimEnd()
    .split('\n')
    .slice(0, 7)
    .join('\n');
}

export async function captureText(browser: Browser, title: string, content: string, file: string) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  try {
    await page.setContent(`<style>
      body { margin: 24px; background: #11151d; color: #f1f4f9; font: 20px system-ui; }
      section { padding: 22px; border: 1px solid #50637d; border-radius: 10px; }
      h1 { margin: 0 0 18px; font-size: 24px; }
      pre { white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 4; font: 17px/1.5 monospace; margin: 0; }
      </style><section><h1></h1><pre></pre></section>`);
    await page.locator('h1').evaluate((element, value) => {
      element.textContent = value;
    }, title);
    await page.locator('pre').evaluate((element, value) => {
      element.textContent = value;
    }, content);
    await page.locator('section').screenshot({ path: file });
  } finally {
    await page.close();
  }
}

export async function captureAuditRows(page: Page, file: string) {
  const filters = page.locator('form.filters');
  await filters.scrollIntoViewIfNeeded();
  const table = page.getByRole('table', { name: /audit/i }).or(page.getByRole('table')).first();
  await expect(table).toBeVisible();
  const start = (await filters.boundingBox())!;
  const end = (await table.boundingBox())!;
  await page.screenshot({
    path: file,
    clip: {
      x: start.x,
      y: start.y,
      width: start.width,
      height: Math.min(end.y + end.height - start.y, page.viewportSize()!.height - start.y),
    },
  });
}

/** The only edit is to an existing, synthetic browser sign-in in this disposable fixture. */
export async function withChangedFixtureRow(
  run: (row: { seq: number; id: string }) => Promise<void>,
): Promise<void> {
  const db = createDb(disposableDatabase());
  try {
    const row = db.$client
      .prepare(
        "SELECT seq, id, description FROM audit_log WHERE action = 'AUTH_LOGIN_SUCCESS' ORDER BY seq DESC LIMIT 1",
      )
      .get() as { seq: number; id: string; description: string };
    const trigger = db.$client
      .prepare("SELECT sql FROM sqlite_master WHERE name = 'audit_log_no_update'")
      .pluck()
      .get() as string;
    const update = db.$client.prepare('UPDATE audit_log SET description = ? WHERE seq = ?');
    const setDescription = db.$client.transaction((value: string) => {
      db.$client.exec('DROP TRIGGER audit_log_no_update');
      update.run(value, row.seq);
      db.$client.exec(trigger);
    });
    setDescription('Changed browser fixture');
    try {
      await run(row);
    } finally {
      setDescription(row.description);
      expect(
        db.$client.prepare('SELECT description FROM audit_log WHERE seq = ?').pluck().get(row.seq),
      ).toBe(row.description);
      expect(
        db.$client
          .prepare("SELECT sql FROM sqlite_master WHERE name = 'audit_log_no_update'")
          .pluck()
          .get(),
      ).toBe(trigger);
    }
  } finally {
    db.$client.close();
  }
}
