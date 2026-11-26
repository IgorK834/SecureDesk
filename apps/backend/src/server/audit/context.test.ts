import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { createMigratedDb, insertUser } from '../db/__fixtures__/test-db';
import { auditLog, users } from '../db/schema';
import { requestAudit } from './context';

it('SEC-72 rolls back the state change and its audit entry together', () => {
  const db = createMigratedDb();
  try {
    const id = insertUser(db, { login: 'employee1', firstName: 'Before' });
    const audit = requestAudit('request-72', '2001:db8::1', { id, login: 'employee1' });
    const abort = new Error('synthetic failure after recording');

    expect(() =>
      db.transaction(
        (tx) => {
          tx.update(users).set({ firstName: 'After' }).where(eq(users.id, id)).run();
          audit.record(tx, {
            action: 'USER_UPDATED',
            outcome: 'SUCCESS',
            details: { changedFields: ['firstName'] },
            subject: { subjectLogin: 'employee1' },
          });
          expect(tx.select().from(auditLog).all()).toMatchObject([
            { action: 'USER_UPDATED', requestId: 'request-72' },
          ]);
          throw abort;
        },
        { behavior: 'immediate' },
      ),
    ).toThrow(abort);

    expect(db.select().from(users).where(eq(users.id, id)).get()?.firstName).toBe('Before');
    expect(db.select().from(auditLog).all()).toEqual([]);
  } finally {
    db.$client.close();
  }
});
