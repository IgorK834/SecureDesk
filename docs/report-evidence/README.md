# Report evidence

These images are generated from the isolated Playwright database, not mocked or hand-authored. Run
`npx playwright test` from the repository root to recreate all browser evidence. The hash image is
captured by Playwright from the real output of `scripts/show-hashes.sh` against that same database.

| Scenario                                      | Evidence file                      | Producer                                          |
| --------------------------------------------- | ---------------------------------- | ------------------------------------------------- |
| Generic failed login                          | `01-failed-login.png`              | `login-failure.spec.ts`                           |
| Forced initial password replacement           | `02-forced-password-change.png`    | `first-login.spec.ts`                             |
| Truncated Argon2id values in SQLite           | `03-hash-in-database.png`          | `hash-evidence.spec.ts`, `scripts/show-hashes.sh` |
| Administrator user list                       | `04-admin-users.png`               | `first-login.spec.ts`                             |
| Persisted security settings                   | `04b-admin-security-settings.png`  | `first-login.spec.ts`                             |
| One-time temporary-password dialog            | `05-temporary-password-reveal.png` | `first-login.spec.ts`                             |
| Guest session denied by the API with HTTP 403 | `06-http-403-guest-admin-api.png`  | `forbidden.spec.ts`                               |
| Backend-enforced inactivity logout            | `07-idle-logout.png`               | `idle-timeout.spec.ts`                            |
| Database entity-relationship diagram          | `er-diagram.png`                   | `npx mmdc -i docs/database-schema.mmd ...`        |

Module 2 uses the fixed `module-2/m2-01` through `m2-08` names documented in
[`module-2/README.md`](module-2/README.md). Seven hermetic Playwright journeys recreate all eight
files. The account-trap and AWS files deliberately identify themselves as local-event evidence
until an operator replaces them with redacted hosted notifications after the live runbook.

## Secret-safety checklist

- The temporary password locator is masked during screenshot capture. The unmasked value exists only
  in the dialog signal and the git-ignored credentials file for the life of the isolated run.
- Closing the dialog clears the value; the spec verifies it is absent from the DOM, URL,
  `localStorage` and `sessionStorage` before continuing.
- `03-hash-in-database.png` contains only deliberately truncated Argon2id PHC strings. It contains no
  plaintext credential.
- The 403 evidence shows the status of an actual `page.request` call with a valid Guest session. It
  does not display cookies, the XSRF token or request headers.
- No screenshot contains a reusable password, TOTP secret, session cookie, XSRF token or `.env`
  value. Generated E2E credentials and the E2E database are git-ignored.
- Image placement is checked by `npm run check:image-locations`; repository image files are allowed
  only in this directory.

## Module 3 evidence

Run `npm run test:e2e:module3 -- --evidence` to regenerate the images from a disposable
SQLite database. The text captures show actual command output, downloaded content or
delivered file lines rendered in a browser for legibility.

| Scenario                                             | Evidence                                  | Producer                                              |
| ---------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| Filtered audit browser                               | `module-3/m3-01-log-browser-filter.png`   | `audit-log.spec.ts`                                   |
| Latest audit rows and hash prefixes from SQLite      | `module-3/m3-02-audit-table-fragment.png` | `audit-log.spec.ts` and `scripts/show-audit-table.sh` |
| Intact verification before changing a synthetic row  | `module-3/m3-03-integrity-intact.png`     | `audit-integrity.spec.ts`                             |
| Verification identifies the changed row              | `module-3/m3-04-integrity-tampered.png`   | `audit-integrity.spec.ts`                             |
| Critical alert opened in the audit drawer            | `module-3/m3-05-alert-in-log.png`         | `detection.spec.ts`                                   |
| Two delivered alert lines with the critical alert ID | `module-3/m3-06-alert-file.png`           | `detection.spec.ts`                                   |
| Actual filtered CSV download                         | `module-3/m3-07-exported-file.png`        | `audit-log.spec.ts`                                   |
| Trap-account audit event                             | `module-3/m3-08-trap-account-entry.png`   | `audit-log.spec.ts`                                   |

The two alert captures use the same run. The browser assertion matches the critical alert ID
from the file against the text in the drawer. Password inputs, temporary password dialogs and
request headers are outside the capture steps. The IP addresses are documentation addresses.
