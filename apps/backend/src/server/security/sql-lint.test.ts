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
