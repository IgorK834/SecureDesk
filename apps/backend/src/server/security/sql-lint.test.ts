import { ESLint } from 'eslint';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const eslint = new ESLint({ cwd: backendRoot });

async function securityMessages(code: string, filePath = 'src/server/example.ts') {
  const [result] = await eslint.lintText(code, { filePath: resolve(backendRoot, filePath) });
  return (result?.messages ?? []).filter(
    (message) =>
      message.ruleId === 'no-restricted-properties' || message.ruleId === 'no-restricted-syntax',
  );
}

describe('SQL construction lint guard (SEC-25)', () => {
  it('rejects sql.raw outside migrations', async () => {
    const messages = await securityMessages(
      "import { sql } from 'drizzle-orm'; sql.raw(userInput);",
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('Raw SQL fragments are forbidden');
  });

  it.each([
    ['template interpolation', 'db.prepare(`SELECT * FROM users WHERE id = ${id}`);'],
    ['string concatenation', "db.exec('DELETE FROM users WHERE id = ' + id);"],
  ])('rejects %s passed to a raw database method', async (_, code) => {
    const messages = await securityMessages(code);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('Use bound parameters');
  });

  it('allows a static SQL literal and parameter binding', async () => {
    expect(
      await securityMessages("db.prepare('SELECT * FROM users WHERE id = ?').get(id);"),
    ).toStrictEqual([]);
  });

  it('exempts migrations, where schema DDL may need raw fragments', async () => {
    expect(
      await securityMessages(
        "import { sql } from 'drizzle-orm'; sql.raw(knownMigrationFragment);",
        'src/server/db/migrations/example.ts',
      ),
    ).toStrictEqual([]);
  });
});

describe('SEC-77 audit log mutation lint guard', () => {
  it.each([
    'db.delete(auditLog).run();',
    'db.update(auditLog).set({ outcome: "SUCCESS" }).run();',
    'db["delete"](auditLog).run();',
    'db.update(schema.auditLog).run();',
    'sql`DELETE FROM ${auditLog}`;',
    'db.prepare("update OR ABORT main.[audit_log] SET outcome = ?");',
    'db.exec(`WITH scope AS (SELECT 1)\nDELETE /* SQL comment */ FROM "audit_log"`);',
  ])('flags %s in application code', async (source) => {
    const messages = await securityMessages(source);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toMatch(/audit_log is append-only/);
  });

  it.each([
    'src/server/db/migrations/example.ts',
    'scripts/audit-tamper-demo/probes.ts',
    'src/server/audit/example.test.ts',
  ])('permits an intentional probe in %s', async (file) => {
    expect(await securityMessages('db.exec("DELETE FROM audit_log");', file)).toEqual([]);
  });

  it('permits appends, reads and writes to unrelated tables', async () => {
    expect(
      await securityMessages(`
      db.insert(auditLog).run();
      db.delete(tickets).run();
      db.exec('SELECT * FROM audit_log');
      db.exec('DELETE FROM audit_log_archive');
    `),
    ).toEqual([]);
  });
});
