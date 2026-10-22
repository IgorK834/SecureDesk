/**
 * The one canonical form of a login. It is what `users.login_normalized` stores (and what the
 * unique index covers), so login, account creation and every lookup must all call this
 * function: `Employee1`, `employee1` and the full-width `ＥＭＰＬＯＹＥＥ１` are the same account.
 *
 * NFKC folds compatibility forms (full-width letters, ligatures) and composes accents;
 * `toLowerCase()` (not the locale-dependent variant) makes the result case-insensitive and
 * identical on every machine. The result is stable: normalizing it again changes nothing.
 */
export function normalizeLogin(login: string): string {
  return login.normalize('NFKC').toLowerCase();
}
