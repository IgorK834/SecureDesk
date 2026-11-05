# Threat model

This is a compact threat model for the SecureDesk student application. It records the controls that
are implemented and tested; it is not a production security certification. The main trust boundary
is the backend API. Angular improves the user experience, but no hidden button, route guard or form
validator is treated as an authorization control.

| Threat                             | Relevant risk                                               | Implemented control                                                                                                       | Verification                                     |
| ---------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Password database disclosure       | Offline password guessing                                   | Per-password salted Argon2id hashes with documented cost parameters; plaintext is never persisted                         | SEC-03 and `password-hasher.test.ts`             |
| User enumeration                   | Learning whether a login exists                             | Identical status and `Login lub hasło niepoprawne` message for a wrong password, unknown, blocked or deleted account      | SEC-01, SEC-02                                   |
| Online guessing                    | Repeated password attempts                                  | Sliding-window limits per IP and per IP plus normalized submitted login; neutral 429 response                             | SEC-27                                           |
| Temporary credential reuse         | Administrator-issued password remains useful                | CSPRNG 16-character value, 12-hour server-side expiry, restricted session and forced one-time replacement                 | SEC-04 to SEC-08                                 |
| Session theft or replay            | A copied cookie grants continuing access                    | HttpOnly session cookie, only a SHA-256 token digest in SQLite, idle/absolute expiry, rotation and server-side revocation | SEC-18 to SEC-23, SEC-30                         |
| Cross-site request forgery         | Victim browser performs an unwanted write                   | Exact Origin/Referer check plus session-bound HMAC double-submit token on authenticated mutations                         | SEC-24                                           |
| Broken access control              | Non-admin uses administrative functions                     | Backend stage and permission checks on every route; frontend filtering is presentation only                               | SEC-05, SEC-15, SEC-16                           |
| Insecure direct object reference   | User reads or changes another user's ticket                 | Object-level creator/assignee rules; unreadable and missing tickets have the same 404 response                            | SEC-17                                           |
| Mass assignment                    | Caller changes role or protected fields indirectly          | Strict Zod request schemas and explicit update allowlists                                                                 | SEC-28                                           |
| Protected ADMIN mutation           | Last recovery account is disabled or removed                | Backend rejects block, delete and role-change operations independently of disabled UI controls                            | SEC-29                                           |
| SQL injection                      | Input changes query structure                               | Parameterized Drizzle queries; lint rejects `sql.raw` and interpolated SQL outside migrations                             | SEC-25 and SQL lint tests                        |
| Cross-site scripting               | Ticket text executes in the browser                         | Angular interpolation only; unsafe HTML APIs are lint-restricted                                                          | SEC-26                                           |
| Credential leakage                 | Password, token or TOTP secret reaches logs, URL or storage | Redacted generic errors, in-memory secret display, masked evidence and static checks                                      | Unit/component review and E2E evidence checklist |
| Stale access after account changes | Blocked/deleted/reset user keeps a session                  | Administrative mutations revoke all target sessions transactionally                                                       | SEC-18 to SEC-20                                 |
| TOTP secret disclosure             | Database copy reveals the second factor                     | AES-256-GCM envelope with a separately managed 32-byte key; the URI is returned once during enrollment                    | TOTP integration tests                           |
| TOTP replay or guessing            | Reused/current-code guessing bypasses the second factor     | Restricted challenge stage, accepted-step replay marker, one-step drift and five failures per 15 minutes per session      | TOTP integration and service tests               |
| Brute-force login guessing         | Many passwords are tried against one account                | CAPTCHA before account work, atomic Nth-failure lock, 15-minute countdown and administrator unlock                        | SEC-31, SEC-38, SEC-40 and browser lockout spec  |
| Credential stuffing                | Leaked login/password pairs are replayed                    | Per-account lock, per-address failure limit, uniform unknown-account path and spraying telemetry                          | SEC-31, SEC-34, SEC-55 and bot simulation        |
| Password spraying                  | One popular password is tried across many accounts          | Per-address limit plus distinct-login detection; account locks remain a second layer                                      | SEC-55 and bot simulation                        |
| CAPTCHA forgery or replay          | Client invents or reuses a solved proof                     | Server-side provider choice; one-time internal update; Turnstile action, hostname, age and siteverify checks; fail closed | SEC-42 to SEC-48                                 |
| Form-filling automation            | A generic bot submits every visible-looking field           | Off-screen, keyboard-inert honeypot; generic response, address-only strike and event                                      | SEC-49, SEC-50                                   |
| Decoy/trap discovery               | An intruder probes bait credentials or a trap login         | Account honeytoken, backup decoy, persistent CRITICAL event, deduplicated background alert                                | SEC-51, SEC-53, SEC-54                           |
| Security-event disclosure          | A non-admin reads attacker telemetry or alert metadata      | Administrator-only permissions and explicit DTOs with a recursive secret-key guard                                        | SEC-58                                           |

## Administrative TOTP recovery

The `users:reset-totp` permission is assigned only to Administrator. Using it must follow an
out-of-band identity check appropriate to the organization, for example an in-person check against
the staff directory plus confirmation by a second administrator. Possession of an administrator
browser session by itself is not adequate proof. The recovery endpoint clears the encrypted secret,
the enablement timestamp and replay marker, then revokes every session belonging to the target. It
does not reveal the old secret and does not create a replacement secret. The protected `ADMIN`
account cannot be used as a normal recovery target.

## Scope and residual risk

The rate limiter is process-local and is lost on restart; multiple backend instances require a
shared atomic store. SQLite is appropriate for the assignment's single-process deployment, not a
high-availability cluster. Browser compromise, malware, a stolen unlocked device and compromise of
the server or environment secrets remain outside what application-layer controls can fully prevent.
Production deployment additionally needs HTTPS, protected backups, key rotation, monitoring and an
operational incident-response process.

Module 2 intentionally accepts several trade-offs. A local image CAPTCHA is demonstrative and weak
against OCR, and it needs an accessible alternative modality. A third-party provider improves the
challenge but adds availability, privacy, latency, CSP and vendor-dependency risks; strict mode
therefore fails password change closed, while an optional bounded internal fallback must be enabled
explicitly. Account lockout can be weaponized for denial of service, so CAPTCHA precedes account
counting, lock duration is finite, an audited administrator unlock exists and nonexistent logins get
the same phantom-lock behavior. Per-address limits reduce spraying but can affect innocent users
behind NAT or a privacy relay. Honeytokens are high-signal only when legitimate scanners and backup
jobs are prevented from touching the lure.
