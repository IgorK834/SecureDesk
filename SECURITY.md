# Security policy

SecureDesk is a learning project that demonstrates security controls in a helpdesk application. It
has not been certified or audited for production use (see [Status and limitations](README.md#status-and-limitations)).
Reports that help make the demonstration more correct are still welcome.

## Supported versions

Only the latest commit on `main` and the latest tagged release receive fixes. There are no
long-term support branches.

## Reporting a vulnerability

Please report privately; do not open a public issue or pull request for a vulnerability.

1. Open the repository's **Security** tab and choose **Report a vulnerability**
   (<https://github.com/IgorK834/SecureDesk/security/advisories/new>). This creates a private
   GitHub Security Advisory that only you and the maintainer can see.
2. Describe the affected component, the steps to reproduce, the impact you expect, and, if you
   have one, a suggested fix. A short proof of concept against your own local instance is ideal.
3. Do not include real personal data, real credentials or anything you obtained from a system you
   do not own.

If private vulnerability reporting is unavailable, open a public issue that says only that you
have a security report to share, and no technical details, so a private channel can be arranged.

### What to expect

| Step                                 | Target                               |
| ------------------------------------ | ------------------------------------ |
| Acknowledgement of your report       | Within 5 working days                |
| First assessment (accepted or not)   | Within 14 days                       |
| Fix or mitigation for confirmed bugs | Depends on severity, usually 30 days |
| Credit in the release notes          | If you want it, once the fix ships   |

This is a volunteer-maintained project: there is no bug bounty, and times are targets, not
guarantees.

## Scope

In scope: the code in this repository, that is the Angular app in `apps/frontend`, the Next.js API
in `apps/backend`, the database migrations and seeds, and the scripts in `scripts/`.

Out of scope:

- Third-party services the project can optionally talk to (Cloudflare Turnstile, Google reCAPTCHA,
  Canarytokens, Grafana Loki). Report those to their vendors.
- Limitations the project already documents, such as the process-local rate limiter, the
  single-process SQLite deployment and the weakness of the local image CAPTCHA against OCR. They
  are listed in the [threat model](docs/threat-model.md#scope-and-residual-risk).
- Test-only switches such as `CAPTCHA_TEST_MODE` and `TURNSTILE_VERIFY_URL`, which the production
  start-up checks refuse.
- Volumetric denial of service, social engineering, and anything that needs physical access to a
  machine running the app.

## Safe harbour

If you act in good faith, test only against an instance you run yourself, avoid reading or changing
data that is not yours, stop when you have shown the issue, and give the maintainer reasonable time
to fix it before disclosing it, the project will not pursue action against you and will treat your
research as authorised. The repository's own `npm run bot-sim` refuses to run against a non-local
host without explicit consent for the same reason.
