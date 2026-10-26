# Security testing

The root `npm test` command first runs `scripts/check-sec-traceability.ts`, then the Vitest unit,
component and API-handler suites with V8 coverage. The traceability check reads this table and
requires every listed identifier to occur in a real `describe`, `it` or `test` title.

## Security scenario matrix

| ID     | Proof in the automated suite                                                   |
| ------ | ------------------------------------------------------------------------------ |
| SEC-01 | Unknown login receives the generic invalid-credentials result.                 |
| SEC-02 | A known login with the wrong password receives the identical result.           |
| SEC-03 | Passwords are stored as salted Argon2id PHC strings, never plaintext.          |
| SEC-04 | A temporary credential opens only an initial-password-change session.          |
| SEC-05 | That restricted session cannot call the administrator API.                     |
| SEC-06 | A temporary password remains valid immediately before twelve hours.            |
| SEC-07 | It expires at exactly twelve hours under the fake clock.                       |
| SEC-08 | One thousand generated temporary passwords meet the 16-character format.       |
| SEC-09 | Eleven characters are below the regular-password minimum.                      |
| SEC-10 | Twelve characters satisfy the length boundary.                                 |
| SEC-11 | Case-varied personal data is rejected when the setting is enabled.             |
| SEC-12 | The same personal-data match is allowed when the setting is disabled.          |
| SEC-13 | A wrong current password changes no credential state.                          |
| SEC-14 | The current and last five password hashes cannot be reused.                    |
| SEC-15 | A Guest receives 403 from every administrator route.                           |
| SEC-16 | An anonymous caller receives 401 from every administrator route.               |
| SEC-17 | An unreadable ticket is indistinguishable from a missing ticket.               |
| SEC-18 | Blocking an account revokes its live sessions.                                 |
| SEC-19 | Soft-deleting an account revokes its live sessions.                            |
| SEC-20 | Resetting a password revokes sessions and the old credential.                  |
| SEC-21 | Logout invalidates the copied old cookie.                                      |
| SEC-22 | The backend revokes an idle-expired session.                                   |
| SEC-23 | A changed idle timeout applies to an already-open session.                     |
| SEC-24 | Foreign origins and missing or incorrect XSRF tokens cannot run a mutation.    |
| SEC-25 | SQL-looking input is data; parser failures and internal failures stay generic. |
| SEC-26 | HTML-looking ticket text renders as text without creating executable markup.   |
| SEC-27 | The sixth failure is throttled identically for known and unknown logins.       |
| SEC-28 | Strict update schemas reject hidden privileged fields.                         |
| SEC-29 | Direct mutations of the protected ADMIN account are rejected.                  |
| SEC-30 | An unexpired server-side session survives reopening the persistent database.   |

API tests invoke the exported Next.js route handlers with real `Request` objects and the cookie
jar in `tests/helpers/api-client.ts`; no Angular code is involved. Database fixtures create an
isolated migrated SQLite database for each test and close it afterwards. The concurrency cases
assert one successful credential state after two competing changes, and reset-versus-change is
forced at the transaction boundary without real sleeping.

## One-time mutation check

The required mutation check was performed against the deterministic unit suite. Each mutation was
reverted immediately after observing the named failure:

| Temporary mutation                                  | Test that fails                                                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Change `MIN_PASSWORD_LENGTH` from 12 to 11          | `length (SEC-09, SEC-10) > never lets a configured minimum drop below the variant-2 floor of 12`                           |
| Change temporary expiry comparison from `>=` to `>` | `the 12-hour lifetime (SEC-06, SEC-07) > is valid up to 1 ms before the deadline and expired from exactly the deadline on` |
| Remove lower-casing from personal-data comparison   | `personal-data rule enabled (SEC-11) > rejects the first name in upper case`                                               |

The temporary-password boundary suite uses only `FakeClock`; it never sleeps. Fixtures use
synthetic values generated inside tests and contain no deployable or reusable credentials.

## TOTP extra-credit coverage

The optional second-factor suites cover the service boundary and exported route handlers. They use
the fake clock to select exact 30-second steps and never wait for a real authenticator window.

| Behavior                                                                          | Automated proof                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------ |
| Enrollment secret is encrypted at rest and the URI is returned only by enrollment | `totp-service.test.ts`, `totp-routes.test.ts`    |
| Enrollment needs a valid current code                                             | wrong-code and successful-enrollment route tests |
| Password alone creates only `TOTP_CHALLENGE` and protected routes reject it       | login-service and TOTP route tests               |
| Correct challenge rotates to `FULLY_AUTHENTICATED`                                | TOTP API positive route test                     |
| Expired, malformed and replayed steps are rejected                                | TOTP service boundary tests                      |
| Sixth failure in 15 minutes returns 429                                           | TOTP service rate-limit test                     |
| Disable requires both the current password and a fresh code                       | TOTP disable route test                          |
| Administrator recovery clears the encrypted state and revokes sessions            | administrator TOTP recovery route test           |

## Browser end-to-end suite

Playwright starts Next.js and Angular against `data/securedesk.e2e.sqlite`. Global setup deletes only
that isolated database, migrates and seeds it, then writes generated credentials to the git-ignored
`tests/e2e/.credentials.json` with mode `0600`. The suite has one worker and zero retries so tests do
not race over shared settings and a flaky first attempt cannot be hidden.

| Journey                                                             | Spec                                                 | Evidence                          |
| ------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------- |
| Wrong and unknown login share the neutral error                     | `login-failure.spec.ts`                              | `01-failed-login.png`             |
| Administrator creates an Employee; first login forces replacement   | `first-login.spec.ts`                                | `02`, `04`, `04b`, `05`           |
| Argon2id hashes, not plaintext, are visible in an isolated DB query | `hash-evidence.spec.ts` and `scripts/show-hashes.sh` | `03-hash-in-database.png`         |
| Create, block, unblock, reset and delete revoke access as expected  | `admin-flows.spec.ts`                                | assertions in the named spec      |
| A valid Guest cookie receives API status 403                        | `forbidden.spec.ts`                                  | `06-http-403-guest-admin-api.png` |
| The next action after 65 seconds with a one-minute limit logs out   | `idle-timeout.spec.ts` (`@slow`)                     | `07-idle-logout.png`              |
| HTML-looking ticket title remains literal text and executes nothing | `xss-ticket.spec.ts`                                 | SEC-26 browser assertion          |

Run the complete suite with `npx playwright test`. A clean run recreates every evidence image. Three
consecutive full runs with retries disabled are the release check for determinism.

## Coverage and isolation

`npm test` enforces at least 80 percent statements, branches, functions and lines for the combined
unit, component and handler suite. The same command checks SEC identifier traceability and rejects
image files outside `docs/report-evidence/`. Integration fixtures use a fresh temporary SQLite file,
run migrations, close the connection and remove the directory after the case; they never open the
development database. The session-restart case deliberately closes and reopens its temporary file.
