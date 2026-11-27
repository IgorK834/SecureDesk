# Module 2 report evidence

`npm run test:e2e:module2` recreates this fixed scenario-to-file map from the isolated E2E database:

| File                                       | Scenario                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `m2-01-account-lockout.png`                | Nth failure, disabled submit and visible 15-minute countdown                                           |
| `m2-02-login-captcha.png`                  | Real internal SVG challenge; answer and password are masked                                            |
| `m2-03-password-change-captcha.png`        | Password-change form with the hermetic Turnstile contract; all password fields are masked              |
| `m2-04-request-without-token-rejected.png` | Actual direct API response: `403 CAPTCHA_FAILED`; proof, cookie and CSRF value omitted                 |
| `m2-05-canarytoken-account-trap-alert.png` | Local CRITICAL account-trap event; replace with the redacted hosted Web-bug e-mail after the live pass |
| `m2-06-canarytoken-aws-alert.png`          | Local CRITICAL decoy event; replace with the redacted hosted AWS-token e-mail after the live pass      |
| `m2-07-bot-simulation-result.png`          | Repeatable nine-scenario protection matrix                                                             |
| `m2-08-security-events.png`                | Administrator-only event list, acknowledgement and honeytoken panel                                    |

The yellow note in `m2-05` and `m2-06` is intentional: no hosted token is configured in CI and a
provider e-mail must never be fabricated. Follow [`../../canarytokens.md`](../../canarytokens.md),
then replace only those two files with real redacted notifications before submission.

No image may expose a password, CAPTCHA answer, session cookie, CSRF value, hosted-token URL, AWS
credential, recipient address or provider tracking identifier. Playwright's `mask` option covers
the form secrets, and the API-rejection page is rebuilt from the sanitized response body only.
