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
