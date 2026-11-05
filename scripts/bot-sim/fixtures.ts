/** Synthetic values only: none is a seeded or deployable credential. */
export const FAKE_CREDENTIALS = Array.from({ length: 20 }, (_, index) => ({
  login: `fake-only-user-${String(index + 1).padStart(2, '0')}`,
  password: `FAKE-ONLY-CREDENTIAL-${String(index + 1).padStart(2, '0')}!`,
}));

export const SEEDED_LOGINS_WITHOUT_PASSWORDS = [
  'ADMIN',
  'manager1',
  'manager2',
  'employee1',
  'employee2',
  'guest1',
  'guest2',
] as const;

export const FAKE_WRONG_PASSWORD = 'FAKE-ONLY-WRONG-PASSWORD!';
