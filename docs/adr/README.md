# Architecture decision records

Why SecureDesk is built the way it is. Format: [MADR](https://adr.github.io/madr/) with YAML front
matter (`status`, `date`). `npm run check:adr` validates names, statuses, dates and that a
superseded record points at an existing successor. To add one, copy
[0000-template.md](0000-template.md) to the next free number.

| #                                                        | Decision                                          | Status             |
| -------------------------------------------------------- | ------------------------------------------------- | ------------------ |
| [0001](0001-split-angular-spa-and-nextjs-api.md)         | Angular SPA split from an API-only Next.js        | accepted           |
| [0002](0002-server-side-revocable-cookie-sessions.md)    | Server-side revocable cookie sessions, not JWT    | accepted           |
| [0003](0003-argon2id-password-hashing-parameters.md)     | Argon2id at the OWASP minimum parameters          | accepted           |
| [0004](0004-csrf-origin-check-and-hmac-double-submit.md) | CSRF: Origin check plus HMAC double submit        | accepted           |
| [0005](0005-sha256-audit-chain-with-head-anchor.md)      | SHA-256 audit chain with a head anchor            | accepted           |
| [0006](0006-process-local-rate-limiting.md)              | Process-local rate limiting                       | superseded by 0008 |
| [0007](0007-sqlite-as-the-database.md)                   | SQLite with Drizzle                               | superseded by 0010 |
| [0008](0008-redis-fail-closed-policy.md)                 | Shared Redis state, security limiters fail closed | proposed           |
| [0009](0009-api-keys-limited-to-ticket-scopes.md)        | API keys limited to ticket scopes                 | proposed           |
| [0010](0010-postgresql-only.md)                          | PostgreSQL only, Testcontainers                   | proposed           |
| [0012](0012-webhook-ssrf-policy.md)                      | Webhook SSRF policy                               | proposed           |

Numbers 0011, 0013 and 0014 are reserved by the Identity module backlog. The four proposed records
describe decisions for features that are not built yet; each becomes `accepted` in the pull request
that implements it.
