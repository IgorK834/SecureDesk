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
| SEC-31 | The configured fifth credential failure locks the account.                     |
| SEC-32 | A lock remains at 14:59 and ends exactly at 15:00 under the fake clock.        |
| SEC-33 | Correct credentials cannot bypass a live account lock.                         |
| SEC-34 | Existing, unknown and account-trap logins expose identical refusal envelopes.  |
| SEC-35 | A successful login resets the prior credential-failure sequence.               |
| SEC-36 | A fifty-request parallel burst admits at most five credential checks.          |
| SEC-37 | Login-protection settings enforce their documented database and API ranges.    |
| SEC-38 | Only an administrator can clear an account lock, and the action is audited.    |
| SEC-39 | A temporary account lock never changes the administrator block flag.           |
| SEC-40 | Missing login CAPTCHA stops before password verification or account counting.  |
| SEC-41 | Wrong, expired and reused login challenges count only against the address.     |
| SEC-42 | Turnstile binds success to action, hostname and the 120-second lifetime.       |
| SEC-43 | Turnstile outage returns 503 before any credential verification.               |
| SEC-44 | Password CAPTCHA refusal leaves the hash and history byte-identical.           |
| SEC-45 | A successful password-change token cannot be replayed.                         |
| SEC-46 | An internal challenge is consumed by the first answer, right or wrong.         |
| SEC-47 | The internal challenge passes at 119 seconds and fails at 121 seconds.         |
| SEC-48 | Original-order text fails while its reversed form succeeds.                    |
| SEC-49 | A filled login honeypot returns the generic 401 and counts only by address.    |
| SEC-50 | Empty/absent honeypots pass; the off-screen field is inaccessible to users.    |
| SEC-51 | Account-trap triggers are stored, externally alerted once, and deduplicated.   |
| SEC-52 | The account-trap login is reserved case-insensitively and has no user row.     |
| SEC-53 | The AWS decoy returns only planted values and records one aggregated alert.    |
| SEC-54 | A failed or hanging alert channel cannot delay or fail the triggering request. |
| SEC-55 | Twenty failures from one address cause the next login to be IP-blocked.        |
| SEC-56 | Rotating the untrusted left side of X-Forwarded-For cannot evade that block.   |
| SEC-57 | Eight distinct login failures from one address raise a spraying event.         |
| SEC-58 | Only administrators list, filter and acknowledge redacted security events.     |
| SEC-59 | Account and address locks remain active after reopening the SQLite database.   |
| SEC-60 | Repeated current-password failures lock password change and revoke sessions.   |
| SEC-61 | The bot simulator refuses an external target without two explicit consents.    |
| SEC-62 | Production startup rejects dummy keys and every test-only CAPTCHA bypass.      |

API tests invoke the exported Next.js route handlers with real `Request` objects and the cookie
jar in `tests/helpers/api-client.ts`; no Angular code is involved. Database fixtures create an
isolated migrated SQLite database for each test and close it afterwards. The concurrency cases
assert one successful credential state after two competing changes, and reset-versus-change is
forced at the transaction boundary without real sleeping.

## One-time mutation check

The required mutation check was performed against the deterministic unit suite. Each mutation was
reverted immediately after observing the named failure:

| Temporary mutation                                          | Test that fails                                                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Change `MIN_PASSWORD_LENGTH` from 12 to 11                  | `length (SEC-09, SEC-10) > never lets a configured minimum drop below the variant-2 floor of 12`                           |
| Change temporary expiry comparison from `>=` to `>`         | `the 12-hour lifetime (SEC-06, SEC-07) > is valid up to 1 ms before the deadline and expired from exactly the deadline on` |
| Remove lower-casing from personal-data comparison           | `personal-data rule enabled (SEC-11) > rejects the first name in upper case`                                               |
| Move the lock row from `limit - 1` to `limit` (`>=` to `>`) | `SEC-31 and SEC-39: locks on the fifth failure without changing the account block flag`                                    |
| Remove the login CAPTCHA guard stage                        | `returns CAPTCHA_REQUIRED before password verification or account-lock reservation (SEC-40)`                               |
| Make the account-honeytoken login comparison case-sensitive | `SEC-52 reserves the account-trap login case-insensitively`                                                                |

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

| Journey                                                             | Spec                                                 | Evidence                                   |
| ------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| Wrong and unknown login share the neutral error                     | `login-failure.spec.ts`                              | `01-failed-login.png`                      |
| Administrator creates an Employee; first login forces replacement   | `first-login.spec.ts`                                | `02`, `04`, `04b`, `05`                    |
| Argon2id hashes, not plaintext, are visible in an isolated DB query | `hash-evidence.spec.ts` and `scripts/show-hashes.sh` | `03-hash-in-database.png`                  |
| Create, block, unblock, reset and delete revoke access as expected  | `admin-flows.spec.ts`                                | assertions in the named spec               |
| A valid Guest cookie receives API status 403                        | `forbidden.spec.ts`                                  | `06-http-403-guest-admin-api.png`          |
| A session backdated by 65 seconds with a one-minute limit logs out  | `idle-timeout.spec.ts`                               | `07-idle-logout.png`                       |
| HTML-looking ticket title remains literal text and executes nothing | `xss-ticket.spec.ts`                                 | SEC-26 browser assertion                   |
| Keyboard skips the off-screen honeypot; bot-filled value is trapped | `honeypot.spec.ts`                                   | SEC-49/SEC-50 browser assertion            |
| Robots advertises and the public backup decoy returns the lure      | `decoy.spec.ts`                                      | SEC-53 browser/API assertion               |
| Lockout countdown and administrator unlock work in a browser        | `lockout.spec.ts`                                    | `module-2/m2-01-account-lockout.png`       |
| A fresh internal CAPTCHA is required for each login attempt         | `captcha-login.spec.ts`                              | `module-2/m2-02-login-captcha.png`         |
| Password change renders Turnstile; a forged token gets API 403      | `captcha-password-change.spec.ts`                    | `module-2/m2-03*`, `m2-04*`                |
| Account trap and backup decoy create visible CRITICAL events        | `honeytoken.spec.ts`                                 | `module-2/m2-05*`, `m2-06*`                |
| Trap alert appears, is acknowledged, and remains admin-only         | `security-events.spec.ts`                            | `module-2/m2-08-security-events.png`       |
| Nine guarded bot attacks produce a repeatable protection matrix     | `bot-sim.spec.ts`                                    | `module-2/m2-07-bot-simulation-result.png` |

Run the complete suite with `npx playwright test`. A clean run recreates every evidence image. Three
consecutive full runs with retries disabled are the release check for determinism. On 2026-11-05,
`npm run test:e2e:module2` completed three consecutive runs with the same result: 7/7, 7/7 and 7/7.
The configuration used one worker and `retries: 0`.

The Module 2 suite is hermetic: internal CAPTCHA test mode still creates one-time, expiring
challenges; Playwright supplies the Turnstile `api.js` widget; and the backend uses the local
siteverify stub. The stub rejects `forged-token`, which lets the browser test capture an actual
`403 CAPTCHA_FAILED` API response. No automated run reaches Cloudflare, Canarytokens or AWS.

The bot evidence run is `npm run bot-sim -- --target http://127.0.0.1:3000 --origin
http://localhost:4200 --database data/securedesk.e2e.sqlite`. It uses the internal CAPTCHA test
answer, but every challenge remains one-time and time-limited. The script prints the legal warning,
limits itself to 20 requests per second and 150 total requests, and writes deterministic JSON and
Markdown reports under `output/`. A non-local target is refused unless its exact hostname is passed
with `--allow-host` and `BOTSIM_I_OWN_THE_TARGET=1` is set. The database guard independently refuses
any filename without an `.e2e.` marker.

## Manual Turnstile check

The automated suite replaces Cloudflare's siteverify endpoint with a local fetch stub. The manual
upstream check was last run on **2026-11-03**, using only Cloudflare's published dummy token and
test secrets: the always-pass secret returned `success: true`; the duplicate-response secret
returned `success: false` with `timeout-or-duplicate`. Only those allowlisted fields were printed.
No real key, request body, token or full provider response was logged. The direct dummy token is
not created by a rendered widget and therefore carries no form action; the hermetic adapter suite
separately proves the required action, hostname and maximum-age binding. See Cloudflare's
[Turnstile testing reference](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

For a full browser check, put the published test site/secret pair in a local untracked `.env`, open
a password-change form and submit the widget-generated token. Production startup refuses all
published `1x`, `2x`, and `3x` dummy key families and the `TURNSTILE_VERIFY_URL` test override.

The reCAPTCHA suite uses a local `siteverify` stub and the same provider-contract cases as
Turnstile: action, hostname, age and timeout. Route integration tests switch
`CAPTCHA_PASSWORD_CHANGE_PROVIDER=recaptcha` and prove both a successful password change and a
timeout that returns 503 before credential verification. Circuit-breaker tests use a fake clock to
open the optional internal fallback after five unavailable results, restore Turnstile after five
minutes, and assert one provider-error event per outage; another route test completes a password
change with the internal proof shape while that circuit is open.

## Coverage and isolation

`npm test` enforces at least 80 percent statements, branches, functions and lines for the combined
unit, component and handler suite. The same command checks SEC identifier traceability and rejects
image files outside `docs/report-evidence/`. Integration fixtures use a fresh temporary SQLite file,
run migrations, close the connection and remove the directory after the case; they never open the
development database. The session-restart case deliberately closes and reopens its temporary file.
No automated test waits for wall-clock time: unit boundaries use `FakeClock`, and the browser idle
journey backdates only its active row in the isolated E2E database before exercising the real
server-side expiry path.
