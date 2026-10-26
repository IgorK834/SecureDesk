// Test fixture: the RBAC matrix plus the seed accounts, without the cost of hashing seven
// passwords. Excluded from coverage (see __fixtures__).
import { createSession } from '../../auth/session-service';
import { csrfTokenForSession } from '../../security/csrf';
import type { AuthStage } from '../schema';
import type { AppDb } from '../connection';
import { seedRbac } from '../seeds/rbac';
import { SEED_USERS } from '../seeds/users';
import { insertUser } from './test-db';

/**
 * Seeds the four roles with their permissions and inserts every account of the seed
 * (ADMIN, manager1-2, employee1-2, guest1-2) with a placeholder hash. Returns the user ids by
 * login. These accounts cannot log in; tests open sessions for them with `signInAs`.
 */
export function seedWorld(db: AppDb): Record<string, string> {
  db.transaction((tx) => seedRbac(tx));
  return Object.fromEntries(
    SEED_USERS.map(({ login, firstName, lastName, roleId }) => [
      login,
      insertUser(db, { login, firstName, lastName, roleId }),
    ]),
  );
}

/** Opens a session and returns the two browser values needed by the API test client. */
export function signInAs(db: AppDb, userId: string, stage: AuthStage = 'FULLY_AUTHENTICATED') {
  const created = createSession(db, userId, stage);
  return {
    token: created.token,
    csrfToken: csrfTokenForSession(created.session.id),
  };
}
