import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Guards the guard: the temporary-password and session-token code is only as strong as its
// randomness, and the lint rule is what keeps a later change from swapping in Math.random.
// If someone deletes or loosens the rule, this test fails instead of the build silently passing.
const backend = path.resolve(__dirname, '../apps/backend');

async function lint(source: string, filePath: string) {
  const eslint = new ESLint({ cwd: backend });
  const [result] = await eslint.lintText(source, { filePath: path.join(backend, filePath) });
  return result?.messages.filter((message) => message.ruleId === 'no-restricted-properties') ?? [];
}

describe('ESLint: Math.random is banned in server code', () => {
  it.each([
    ['a direct call', 'export const x = Math.random();'],
    ['a computed access', "export const x = Math['random']();"],
    ['destructuring', 'const { random } = Math;\nexport const x = random();'],
  ])('reports %s under apps/backend/src/server', async (_, source) => {
    const messages = await lint(source, 'src/server/auth/probe.ts');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2); // an error, which fails `npm run lint`
    expect(messages[0]?.message).toContain('Math.random');
  });

  it('applies to nested server directories as well', async () => {
    expect(
      await lint('export const x = Math.random();', 'src/server/db/seeds/probe.ts'),
    ).toHaveLength(1);
  });

  it('does not ban other Math functions in server code', async () => {
    expect(
      await lint('export const x = Math.floor(1.5) + Math.max(1, 2);', 'src/server/probe.ts'),
    ).toHaveLength(0);
  });

  it('leaves code outside the server directory alone (the rule is scoped, not global)', async () => {
    expect(await lint('export const x = Math.random();', 'src/app/probe.ts')).toHaveLength(0);
  });
});
