// Local recovery for the administrator account: `npm run admin:unlock -- ADMIN`.
import { and, eq, isNull } from 'drizzle-orm';
import { users } from '../src/server/db/schema';
import { ROLES } from '../src/server/permissions/codes';
import { clearAccount } from '../src/server/security/attempt-tracker';
import { clock } from '../src/server/time/clock';
import { normalizeLogin } from '../src/server/users/login';

async function main(): Promise<void> {
  const submitted = process.argv[2]?.trim();
  if (!submitted) throw new Error('Usage: admin:unlock -- <login>');

  const { db } = await import('../src/server/db/client');
  const loginNormalized = normalizeLogin(submitted);
  const administrator = db
    .select({ login: users.login })
    .from(users)
    .where(
      and(
        eq(users.loginNormalized, loginNormalized),
        eq(users.roleId, ROLES.ADMINISTRATOR),
        isNull(users.deletedAt),
      ),
    )
    .get();
  if (!administrator) throw new Error('active administrator account not found');

  clearAccount(db, loginNormalized, clock.now());
  console.log(`admin:unlock OK - cleared the login-attempt lock for ${administrator.login}`);
  db.$client.close();
}

void main().catch((error: unknown) => {
  console.error(`admin:unlock failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
