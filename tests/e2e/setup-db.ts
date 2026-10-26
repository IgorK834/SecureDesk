import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../../apps/backend/src/server/auth/password-hasher';
import { createDb } from '../../apps/backend/src/server/db/connection';
import { runMigrations } from '../../apps/backend/src/server/db/migrate';
import { users } from '../../apps/backend/src/server/db/schema/users';
import { seedDatabase } from '../../apps/backend/src/server/db/seeds/index';
import { E2E_CREDENTIALS_PATH, E2E_DATABASE_PATH, type E2eCredentials } from './helpers';

const selected = {
  admin: 'ADMIN',
  manager: 'manager1',
  employee: 'employee1',
  guest: 'guest1',
} as const;

async function main(): Promise<void> {
  mkdirSync(path.dirname(E2E_DATABASE_PATH), { recursive: true });
  for (const suffix of ['', '-shm', '-wal'])
    rmSync(`${E2E_DATABASE_PATH}${suffix}`, { force: true });

  const db = createDb(E2E_DATABASE_PATH);
  runMigrations(db);
  await seedDatabase(db, { demoTickets: true });

  const credentials = {} as E2eCredentials;
  for (const [name, login] of Object.entries(selected) as [keyof E2eCredentials, string][]) {
    const password = `E2E-${randomBytes(18).toString('base64url')}!9`;
    const passwordHash = await hashPassword(password);
    const now = new Date();
    db.update(users)
      .set({
        passwordHash,
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
        passwordChangedAt: now,
        updatedAt: now,
      })
      .where(eq(users.loginNormalized, login.toLowerCase()))
      .run();
    credentials[name] = { login, password };
  }
  db.$client.close();

  writeFileSync(E2E_CREDENTIALS_PATH, `${JSON.stringify(credentials, null, 2)}\n`, {
    mode: 0o600,
  });
}

await main();
