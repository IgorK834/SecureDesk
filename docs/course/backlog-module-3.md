# SecureDesk — Module 3 Implementation Backlog

**Course:** Cybersecurity
**Assignment:** Module 3 — Monitoring and recording of security events ("Monitorowanie i rejestrowanie zdarzeń bezpieczeństwa")
**Individual variant:** No. 2, applied in every module (confirmed by the student): **table in the database · SHA-256 chain · rule "successful login right after ≥ 3 failed attempts on the same account" · alert channel "separate alert file"**
**Application:** SecureDesk — the helpdesk application of Modules 1 and 2 (Angular + Next.js API + SQLite)
**Status:** Implementation specification / actionable product backlog, draft of 2026-11-26
**Language:** English (API error messages stay Polish and UI texts stay English, as in the existing code)

---

## 0. How to use this document

This backlog extends the Module 1 backlog (`docs/course/backlog.md`, SD-01 to SD-32) and the Module 2 backlog (`docs/course/backlog-module-2.md`, SD-33 to SD-64), both implemented. It continues the numbering: **SD-65 to SD-92**, epics **13 to 18**, task IDs **Task 13.1 to Task 18.5**, so the milestones and issues of all three modules can live in one repository. Every item has an objective, an implementation checklist, acceptance criteria, dependencies and a size, in the same layout as Module 2 so the GitHub issue script can be generated from this file in the same way.

It was written against the repository as it is now (the Module 2 `security_events` service, alert dispatchers, route wrapper, purge job, admin UI, tests and docs were read), so file paths and "what changes" statements refer to real code.

### Requirement provenance

| Tag            | Meaning                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `[ASSIGNMENT]` | Explicitly required by the Module 3 PDF ("Moduł 3 – Monitorowanie i rejestrowanie zdarzeń bezpieczeństwa.pdf"), sections 2 and 5 |
| `[VARIANT]`    | Required by row 2 of the individual-variant table (section 3 of the PDF)                                                         |
| `[EXTRA]`      | The PDF's "zadanie dodatkowe (na ocenę bardzo dobrą)": Canarytokens webhook or shipping logs to an external system               |
| `[DESIGN]`     | Project decision to make the feature cohesive, demonstrable and extensible. Not a course requirement                             |
| `[HARDENING]`  | Security measure beyond the PDF's explicit list that a sound implementation needs                                                |

### Priorities and sizes

| Priority         | Meaning                                                                    | Completion expectation                       |
| ---------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| P0 — Required    | Mandatory assignment or variant functionality, or indispensable foundation | Must be implemented for Module 3 completion  |
| P1 — Recommended | Graded extra, hardening or demonstrator that supports the P0 story         | Implement after or alongside related P0 work |
| P2 — Optional    | Nice to have                                                               | Only when P0 and P1 are done                 |

The two extra-credit tasks are **P1**, as the per-IP task was in Module 2. Size scale: **S** up to 1 person-day, **M** 1–2, **L** 3–5, **XL** more than 5.

---

## 1. Original assignment: authoritative requirements

### 1.1 What the PDF asks for

Theory covered: logs detect an attack, reconstruct it and hold users accountable; missing logging and alerting is its own OWASP Top 10 category and follows from GDPR and NIS2; every entry answers who, what, when, from where, with what result; time is UTC; no passwords (also wrong ones), session tokens or keys in logs; personal data only as far as necessary; log injection; integrity through hashes; SIEM systems and detection rules.

| Ref. | PDF task                                                                                                                                                                                                                                                                                                        | Implementation consequence                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| C-01 | **Recording events:** login and logout, failed logins, account locks, password changes (also failed), creating, blocking and deleting users, role and settings changes, access denials, use of the trap account. An entry holds user, date and time, IP address, action, description and result (success/error) | Append-only audit log with a closed event catalogue, recorded at every call site           |
| C-02 | **Log browser** for the administrator and for the Auditor role "if it exists in the Module 1 variant": list with filters (user, date, event type) and **export to a file**. The Auditor is read-only                                                                                                            | Admin-only read API, export API and Angular page. Variant 2 has no Auditor (decision D-02) |
| C-03 | **Integrity:** the variant's mechanism detects a change or deletion of entries. The administrator can run a verification over the whole log and sees "log intact" or "tampering detected", with the entry concerned if the mechanism allows it. Demonstrate by changing or deleting an entry by hand            | SHA-256 chain, verification service, API and UI, tamper-demo tooling                       |
| C-04 | **Log protection:** recording cannot be switched off, the application offers no editing or deleting of entries, and operations on the log (export, verification) are themselves recorded                                                                                                                        | Triggers, no mutating routes, static guards, self-auditing                                 |
| C-05 | **Alerts:** two detection rules: at least **5 failed logins on one account within 5 minutes**, and the rule of the variant. The alert goes to the log and is sent through the variant's channel                                                                                                                 | Rule engine, two rules, alert file channel                                                 |
| C-06 | **Extra (very good grade):** pass Canarytokens alerts to the application through a webhook, **or** ship logs to an external system (for example Wazuh, Grafana Loki)                                                                                                                                            | Webhook receiver and/or Loki shipping                                                      |

Test only on the own application.

### 1.2 Individual variant No. 2 (section 3 of the PDF)

| Dimension            | Variant 2                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage format       | **Table in the database** (`audit_log` in the existing SQLite database)                                                                           |
| Integrity protection | **SHA-256 chain**: each entry's hash is computed over the entry's content and the previous entry's hash, stored in a **column of the same table** |
| Detection rule       | **A successful login right after ≥ 3 failed attempts on the same account**                                                                        |
| Alert channel        | **A separate alert file**                                                                                                                         |

The PDF asks to comment on the MD5 and SHA-1 variants in the conclusions; variant 2 uses neither, but the report may add a short note on why they are obsolete (collision attacks) and why SHA-256 is not a password hash either (Module 1, control question 2).

### 1.3 Control questions (answers go into the report)

1. Why does practice not build its own logging and event-analysis system from scratch but use ready libraries and SIEM systems?
2. Why must passwords never be written to logs, even mistyped ones?
3. What is log injection?
4. How does the mechanism used in the project detect a change or deletion of an entry, and how could an attacker get around it?

### 1.4 Required reporting deliverable

A PDF report with: introduction in own words; completed exercises (variant number, a sample log entry, the list of recorded events, the description of integrity protection and detection rules, key code); screenshots (log browser with a filter, a fragment of the log table, integrity verification before and after modifying an entry, generated alerts, the exported file); answers to the four questions; **conclusions summarising the whole project (Modules 1–3)**; a repository link or code archive.

---

## 2. Scope and relation to Modules 1 and 2

### 2.1 In scope

- A new, append-only, hash-chained `audit_log` table and one audit service every other module writes through.
- Recording of every event the PDF lists, plus the operations on the log itself.
- Administrator log browser (filters, details) and file export; verification of the whole chain with the offending entry reported.
- Protection of the log (no switch, no edit, no delete) and demonstration of tampering and detection.
- Detection rules (5 failures in 5 minutes; success after ≥ 3 failures), alerts into the log and into a separate alert file.
- Extra credit: Canarytokens webhook receiver and Grafana Loki shipping.
- Tests, E2E evidence, documentation and the report with project-wide conclusions.

### 2.2 Out of scope

- A full SIEM, anomaly or machine-learning detection, geo-IP enrichment.
- A new Auditor role (variant 2 has four roles; decision D-02).
- Recording ordinary business reads (ticket lists, dashboards) or every ticket change; the assignment's list does not include them.
- Deleting or archiving audit entries (decision D-06): the log only grows, and the report states the retention consequence honestly.
- Making the log tamper-proof against an attacker who controls the host: a hash chain is tamper-**evident**, not tamper-proof (control question 4).

### 2.3 What already exists and how Module 3 changes it

| Existing artifact                                                                                                      | Today                                                                                                              | Change in Module 3                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/security/events.ts`, `db/schema/security-events.ts` (Module 2)                                                 | Mutable alert feed: aggregated noisy types, acknowledgement columns, purge after the retention days                | **Stays** as the alert feed and admin notification. It is not the audit log: it can be aggregated, acknowledged and purged, which an audit log must never be (SD-65) |
| `server/security/alerts.ts` (`AlertDispatcher`, `registerAlertDispatcher`, `dispatchAlerts`)                           | Pluggable, timeout-bounded, never throws into the caller; used by the honeytoken events and the webhook dispatcher | A file dispatcher is added for detection alerts (SD-86)                                                                                                              |
| `server/security/webhook-alerts.ts`                                                                                    | Optional webhook for CRITICAL events                                                                               | Unchanged; may receive detection alerts too                                                                                                                          |
| `server/security/log-event.ts`, `redact.ts`                                                                            | Operational log line: event name + request id only                                                                 | Stays for diagnostics. Not an audit trail                                                                                                                            |
| `server/security/client-ip.ts` (Module 2)                                                                              | Resolves the trusted client address and its `/64` key                                                              | The audit entry stores the **raw** address, not the key (SD-68)                                                                                                      |
| `server/http/route-handler.ts` `defineRoute`, `toResponse()`                                                           | Central pipeline; denials are mapped to responses and only a diagnostic line is logged                             | Builds the `AuditContext`; the single place that records access denials (SD-68, SD-72)                                                                               |
| `server/auth/login-guard.ts`, `login-service.ts`, `security/attempt-tracker.ts` (Module 2)                             | Pipeline stages, reserve-then-verify lockout, `ACCOUNT_LOCKED` security event                                      | Each outcome also writes an audit entry; the success entry commits with the session (SD-69)                                                                          |
| `server/auth/password-service.ts`, `users/account-service.ts`, `users/user-service.ts`, `security/settings-service.ts` | State changes, many inside transactions                                                                            | Write their audit entries **in the same transaction** (SD-70 to SD-72)                                                                                               |
| `server/maintenance/purge.ts`                                                                                          | Purges `login_attempts`, `captcha_challenges`, `security_events`                                                   | Must never touch `audit_log`; tested (SD-81)                                                                                                                         |
| `security/sql-lint.test.ts`, ESLint restricted syntax                                                                  | Forbids raw and interpolated SQL                                                                                   | Extended: no `UPDATE`/`DELETE` of `audit_log` outside migrations and the demo script (SD-81)                                                                         |
| `tests/route-guard-conformance.test.ts`, `tests/admin-routes-authz.test.ts`                                            | Public-route allowlist; every admin route tested across the four roles                                             | New admin routes added; a new bypass list for the CSRF-exempt webhook (SD-88); a mutating-route audit coverage guard (SD-73)                                         |
| `permissions/codes.ts`, `matrix.ts`, `docs/permissions.md`                                                             | 23 codes after Module 2                                                                                            | +3 Administrator-only codes (SD-65)                                                                                                                                  |
| `features/admin-security-events/*`, `nav-items.ts`, `app.routes.ts`, `admin-api.service.ts`                            | Security events page and nav entry                                                                                 | New `/admin/audit-log` page, nav entry, API methods (SD-76); alerts linked from both pages (SD-87)                                                                   |
| `docs/testing.md` + `scripts/check-sec-traceability.ts`                                                                | SEC-01 … SEC-62, each must appear in a test title                                                                  | SEC-63 … SEC-96 continue the mechanism (section 9)                                                                                                                   |
| `scripts/purge.ts`, `scripts/admin-unlock.ts`, `scripts/reset-db.ts`                                                   | Maintenance CLIs, `reset-db` refuses production                                                                    | New `audit-verify`, `audit-tamper-demo` CLIs (SD-80, SD-82)                                                                                                          |
| `tests/e2e/*`, `playwright.config.ts`                                                                                  | One worker, no retries, isolated E2E database                                                                      | New specs and evidence (SD-91)                                                                                                                                       |

---

## 3. Architecture and conventions

### 3.1 Recording, chaining, detection, alerting

```
 Request ─▶ defineRoute ─▶ handler / service ─▶ audit.record(tx, event)                 SQLite
            builds AuditContext        │            │  one IMMEDIATE transaction          ┌─────────────────────────┐
            (actor, raw IP, request id)│            ├─ read last (seq, entry_hash)        │ audit_log               │
                                       │            ├─ canonicalize + sanitize            │  seq, id, occurred_at   │
            state change + audit entry │            ├─ entry_hash = SHA-256(prev + body)  │  actor_*, subject_*, ip │
            commit together (or neither)            └─ INSERT (triggers forbid UPDATE/    │  action, description    │
                                                        DELETE)                           │  outcome, details       │
                                                                                          │  prev_hash, entry_hash  │
   after commit                                                                           └─────────────────────────┘
   ├─ head anchor file ← {seq, entry_hash}                    (SD-79)
   ├─ detection engine: rule 1 (5 failures / 5 min), rule 2 (success after ≥ 3 failures)   (SD-83..85)
   │     └─ alert = audit entry ALERT_RAISED + security event DETECTION_ALERT
   │            └─ AlertDispatcher: alert file (variant 2), webhook, Loki shipper           (SD-86, SD-89)
   └─ Loki shipper (optional)                                                               (SD-89)

 Admin ─▶ /admin/audit-log ─▶ read API · export API (audited) · verify API (audited) ─▶ INTACT | TAMPERED + entry
```

### 3.2 Conventions inherited from Modules 1 and 2 (unchanged)

- Every handler is built with `defineRoute`; public routes are on the conformance allowlist; no route skips the pipeline.
- Server messages are Polish, UI texts English and chosen by the client from the machine-readable `error.code`.
- Error envelope `{ "error": { "code", "message", "details"? } }`, `Cache-Control: no-store`; strict Zod schemas; unknown keys are `400`.
- Time comes from `server/time/clock.ts`; tests use the fake clock and never sleep.
- Drizzle migrations only (custom SQL files are allowed, as in `0001_protect_admin_account.sql`).
- New SEC ids go into `docs/testing.md` and into test titles so `check-sec-traceability` passes.

### 3.3 New configuration (`.env.example`)

```dotenv
# Audit log (SD-67, SD-79, SD-80)
AUDIT_SUBJECT_PEPPER=replace-with-output-of-openssl-rand-base64-32   # keyed reference for unknown logins
AUDIT_ANCHOR_PATH=./data/audit/head-anchor.json
AUDIT_VERIFY_INTERVAL_MINUTES=60
AUDIT_EXPORT_MAX_ROWS=100000
# Alert channel of variant 2 (SD-86): append-only JSON Lines, outside any public directory
ALERT_FILE_PATH=./data/alerts/security-alerts.jsonl
# Extra credit, optional (SD-88, SD-89)
CANARYTOKENS_WEBHOOK_SECRET=
LOKI_PUSH_URL=
```

There is deliberately **no** variable or setting that disables auditing (SD-81).

### 3.4 OWASP and standards covered

OWASP Top 10 "Security Logging and Alerting Failures", the OWASP Logging Cheat Sheet (what to log, what never to log, log injection, protection of logs) and NIST SP 800-92 (log management). Check the exact category names against the current OWASP Top 10 before quoting them in the report.

---

## 4. Data model additions

### 4.1 `audit_log` (append-only, hash-chained)

| Field           | Type                              | Purpose                                                                                                                               |
| --------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `seq`           | INTEGER PRIMARY KEY AUTOINCREMENT | Position in the chain. Assigned explicitly from `sqlite_sequence`, never reused after a delete, so a hole is visible                  |
| `id`            | TEXT UUID, unique                 | Stable identifier shown to people and in exports                                                                                      |
| `occurred_at`   | TEXT                              | UTC ISO-8601 with milliseconds (`2026-11-26T09:15:03.123Z`); the exact string is hashed                                               |
| `actor_type`    | TEXT                              | `USER`, `ANONYMOUS`, `SYSTEM` (CHECK)                                                                                                 |
| `actor_user_id` | TEXT, nullable FK                 | Who acted, when an account is involved                                                                                                |
| `actor_login`   | TEXT, nullable                    | Snapshot of the actor's login at that time                                                                                            |
| `subject_login` | TEXT, nullable                    | The account a failed attempt or an admin action concerns, **only when the account exists** (or is a registered trap)                  |
| `subject_ref`   | TEXT, nullable                    | For a login that does not exist: `ref:` + first 16 hex of HMAC-SHA256(`AUDIT_SUBJECT_PEPPER`, normalized login). Never the typed text |
| `ip`            | TEXT, nullable                    | Raw client address as resolved by the trusted-proxy logic                                                                             |
| `action`        | TEXT                              | Code from the event catalogue (section 6.2), validated in code                                                                        |
| `description`   | TEXT                              | Human-readable sentence built from a fixed template and validated fields, never from raw user text                                    |
| `outcome`       | TEXT                              | `SUCCESS` or `FAILURE` (CHECK)                                                                                                        |
| `details`       | TEXT                              | Canonical JSON validated against a strict per-action schema                                                                           |
| `request_id`    | TEXT                              | Correlates with the operational log                                                                                                   |
| `prev_hash`     | TEXT                              | 64 hex; the `entry_hash` of the previous entry, or 64 zeros for the first                                                             |
| `entry_hash`    | TEXT                              | 64 hex; SHA-256 of `prev_hash`, a newline and the canonical entry (section 6.1)                                                       |

Indexes: `(occurred_at)`, `(action, occurred_at)`, `(actor_user_id, occurred_at)`, `(subject_login, occurred_at)`, `(subject_ref, occurred_at)`. CHECK constraints on `actor_type`, `outcome` and on the length of both hashes.

Immutability: two triggers, `audit_log_no_update` and `audit_log_no_delete`, `RAISE(ABORT, ...)` on any `UPDATE` or `DELETE`. They stop mistakes and application-level abuse; someone with file access can drop them, which is why the chain exists (section 6.3).

### 4.2 No new table for alerts

An alert is three things that already have a home: an `ALERT_RAISED` entry in `audit_log` (the record, "alert goes to the log"), a `DETECTION_ALERT` row in `security_events` (so the existing admin banner, acknowledgement and dispatcher path work) and a line in the alert file (the variant's channel). They carry the same alert id.

### 4.3 Optional shipper cursor (SD-89)

The id of the last audit entry shipped to Loki, kept in a one-row table or a small file; advanced only after a `2xx` answer.

### 4.4 Invariants

- Audit rows are never updated, deleted, aggregated, acknowledged or purged by any code path of the application.
- No audit row holds a password, hash, token, TOTP secret, CAPTCHA answer or the typed text of an unknown login.
- Every state change the PDF lists and its audit entry commit together or not at all.
- The chain has no gaps: `seq` increases by one and `prev_hash` equals the previous `entry_hash`.

---

## 5. Permission additions

All three codes go to **Administrator only**; Manager, Employee and Guest get none, and `matrix.test.ts` pins that. They are separate codes on purpose, so a future read-only Auditor role (the PDF's "if it exists in the variant") would need only a matrix change: `audit-log:read` and `audit-log:export` without `audit-log:verify` or any settings permission.

| Code               | Used by                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `audit-log:read`   | List and read entries, read detection rules and the last verification result (SD-74, SD-87) |
| `audit-log:export` | Export entries to a file (SD-75)                                                            |
| `audit-log:verify` | Run the integrity verification (SD-78)                                                      |

Public endpoint added only by the extra task: `POST /api/webhooks/canarytokens/[secret]` (SD-88).

---

## 6. Behavioural rules

### 6.1 Entry format and the chain

1. **Canonical content.** A fixed-order JSON array prefixed with a version string: `["sd-audit-v1", seq, id, occurred_at, actor_type, actor_user_id, actor_login, subject_login, subject_ref, ip, action, description, outcome, canonical_details, request_id]`. `canonical_details` is the details JSON with sorted keys and no whitespace. `null` stays `null`.
2. **Hash.** `entry_hash = hex(SHA-256(prev_hash + "\n" + canonical_content))`. The first entry uses `prev_hash = 64 zeros`.
3. **Append.** Inside one `BEGIN IMMEDIATE` transaction: read the newest `(seq, entry_hash)`, take the next `seq` from `sqlite_sequence`, build and hash the entry, insert. `better-sqlite3` is synchronous, so nothing is awaited between the read and the insert and two appends cannot interleave in one process; `IMMEDIATE` covers several processes.
4. **Where the entry commits.** For state changes the caller passes its own transaction, so the change and its entry commit together. Refusals (failed logins, denials) are written on their own.
5. **Failure policy.** If the audit write fails, a state change or a successful login or password change **fails closed** (generic `500`, nothing changed, no session created): nothing may happen unrecorded. A refusal is already a refusal; its write failure goes to the operational log and the refusal is still returned.
6. The format is documented in `docs/architecture.md` with a short independent snippet so a reviewer can verify an export outside the application.

### 6.2 Event catalogue (closed list)

Each action has a strict `details` schema and a description template. `FAILURE` entries carry a fixed `reason` code.

| Group                 | Actions                                                                                                                                                                                                                                                  | Notes                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Authentication        | `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILURE` (reason `BAD_CREDENTIALS`, `ACCOUNT_LOCKED`, `CAPTCHA_FAILED`, `HONEYPOT`, `IP_BLOCKED`), `AUTH_LOGOUT`, `AUTH_SESSION_EXPIRED`, `AUTH_ACCOUNT_LOCKED`, `AUTH_TRAP_ACCOUNT_USED`, `AUTH_TOTP_CHALLENGE`       | The refusal by the IP block is written once per address per 5-minute bucket, so a flood cannot grow the table without bound |
| Passwords             | `PASSWORD_CHANGED` (kind `INITIAL`, `ORDINARY`, `EXPIRED`), `PASSWORD_CHANGE_FAILED` (reason `CURRENT_PASSWORD_INCORRECT`, `POLICY_VIOLATION`, `REUSED`, `CAPTCHA_FAILED`, `BRUTE_FORCE_LIMIT`, `TEMPORARY_PASSWORD_EXPIRED`), `PASSWORD_RESET_BY_ADMIN` | Violation codes only, never a password value                                                                                |
| User administration   | `USER_CREATED`, `USER_UPDATED`, `USER_ROLE_CHANGED` (from, to), `USER_BLOCKED`, `USER_UNBLOCKED`, `USER_DELETED`, `USER_UNLOCKED`, `USER_TOTP_RESET`                                                                                                     | Actor is the administrator, subject is the target account                                                                   |
| Settings and security | `SETTINGS_CHANGED` (per key: from, to), `TOTP_ENROLLED`, `TOTP_DISABLED`                                                                                                                                                                                 | Setting values are non-secret numbers and flags                                                                             |
| Refusals and traps    | `ACCESS_DENIED` (reason `PERMISSION`, `STAGE`, `TOTP_REQUIRED`, `CSRF`), `OBJECT_ACCESS_DENIED`, `DECOY_RESOURCE_ACCESSED`                                                                                                                               | Anonymous `401` is **not** recorded individually: it is noise, and bots are visible through Module 2 events                 |
| The log itself        | `AUDIT_LOG_VIEWED` (at most once per administrator session per 5 minutes), `AUDIT_LOG_EXPORTED`, `AUDIT_LOG_VERIFIED`, `ALERT_RAISED`, `AUDIT_TAMPER_DETECTED`                                                                                           | The PDF requires export and verification to be logged                                                                       |
| Extra                 | `HONEYTOKEN_ALERT_RECEIVED`                                                                                                                                                                                                                              | Only with SD-88                                                                                                             |

### 6.3 Integrity: what the chain detects and what it does not

- **Detects:** a changed entry (its recomputed hash differs), a deleted entry in the middle (the next entry's `prev_hash` no longer matches, and `seq` has a hole), a reordered or inserted entry (hash and sequence break).
- **Does not detect on its own:** deleting the **tail** of the log (what remains is a valid chain) and recomputing every later hash after a change (SHA-256 is not keyed). The first is closed by the **head anchor** (SD-79): the newest `(seq, entry_hash)` is also written to a file outside the database, and verification demands that exactly that entry still exists. The second is closed only if the anchor, or a copy of the log, sits somewhere the attacker cannot write (the optional Loki copy of SD-89, an off-host anchor). This is the honest answer to control question 4, and the tamper demo (SD-82) shows each case.
- A hash chain makes tampering **evident**, not impossible. Tamper-**proof** needs write-once storage or a remote witness.

### 6.4 Privacy and log injection

- Never logged: passwords (also wrong ones), password hashes, session tokens, CSRF tokens, TOTP secrets and codes, CAPTCHA answers, Canarytokens URLs and keys. The strict schemas and the secret-key guard enforce it.
- Users sometimes type their password into the login field, so the typed login of an **unknown** account is stored only as a keyed reference (`subject_ref`), never as text. A login that exists, or the registered trap login, is stored as is.
- The raw IP address and the actor's login are personal data under GDPR: they are stored because the PDF requires "who and from where", the fields are minimal, and the retention consequence of never deleting is stated in the report (D-06).
- Log injection: every user-influenced string is passed through one sanitizer that escapes CR, LF, other control characters, U+2028/U+2029 and bidirectional or zero-width controls as visible `\uXXXX`, and is length-limited. `description` is built only from templates and validated fields; the JSON encoding escapes quotes. Exports neutralise spreadsheet formulas. The UI renders with Angular interpolation only.

### 6.5 Detection rules

1. **Rule 1 (assignment): burst of failed logins.** At least 5 `AUTH_LOGIN_FAILURE` entries (reason `BAD_CREDENTIALS` or `ACCOUNT_LOCKED`) for the same account within a rolling 5-minute window `(now − 5 min, now]`. Attempts refused because of the Module 2 lock count, otherwise a low lock threshold set by the administrator would hide the pattern. Severity `WARNING`.
2. **Rule 2 (variant 2): success after failures.** An `AUTH_LOGIN_SUCCESS` for an account that has ≥ 3 consecutive `AUTH_LOGIN_FAILURE` entries with reason `BAD_CREDENTIALS` since its previous success, the failures all within the preceding **10 minutes** (decision D-03). Severity `CRITICAL`: the credentials were probably guessed.
3. Both rules are evaluated right after the triggering entry commits, are deduplicated by a 5-minute cooldown per (rule, account), and never recurse (`ALERT_RAISED` triggers nothing). A failing detection must not fail the request that caused it.
4. **Alert** = an `ALERT_RAISED` entry, a `DETECTION_ALERT` security event and a line in the alert file, sharing one alert id.

### 6.6 Operations on the log

Viewing, exporting and verifying are administrator-only, each writes its own entry (the export entry is written **before** the first byte is sent, with the filters, the row count and the sequence range), and none of them can modify an entry. Verification appends `AUDIT_LOG_VERIFIED` after it finishes; its result describes the log as it was before that append.

---

## 7. API contract

### 7.1 Error codes added (messages Polish, UI words its own text)

| Status | `error.code`               | Server message                                                      | When                                                                          |
| ------ | -------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 400    | `EXPORT_TOO_LARGE`         | Zakres eksportu jest zbyt duży. Zawęź filtry                        | The filtered export exceeds `AUDIT_EXPORT_MAX_ROWS`                           |
| 409    | `VERIFICATION_IN_PROGRESS` | Weryfikacja dziennika już trwa                                      | A second verification starts while one runs                                   |
| 500    | `AUDIT_UNAVAILABLE`        | Nie można zapisać zdarzenia w dzienniku. Operacja została przerwana | The audit write failed on a state change (fail closed); generic, no internals |

### 7.2 Changed behaviour of existing endpoints

Every mutating endpoint now also writes its audit entry (section 6.2). No request or response shape changes, except that the Module 1 and 2 error and success paths gain entries. The coverage guard (SD-73) pins this.

### 7.3 New endpoints

| Method | Route                                 | Auth                       | Behaviour                                                                                                                   |
| ------ | ------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/admin/audit-log`                | `audit-log:read`           | Paginated list, newest first; filters `user`, `action`, `outcome`, `from`, `to`, `page`, `pageSize` ≤ 100                   |
| GET    | `/api/admin/audit-log/[seq]`          | `audit-log:read`           | One entry with its hashes                                                                                                   |
| POST   | `/api/admin/audit-log/export`         | `audit-log:export`         | Body: the filters and `format` (`csv` or `jsonl`); streams a file; audited before sending; POST so a link cannot trigger it |
| POST   | `/api/admin/audit-log/verify`         | `audit-log:verify`         | Verifies the whole chain; returns `INTACT` or `TAMPERED` with the first problem; audited                                    |
| GET    | `/api/admin/audit-log/integrity`      | `audit-log:read`           | The latest verification result and time                                                                                     |
| GET    | `/api/admin/detection-rules`          | `audit-log:read`           | Rule definitions, thresholds and last alert time (read-only)                                                                |
| POST   | `/api/webhooks/canarytokens/[secret]` | Public, secret in the path | Extra task only: receives a Canarytokens alert                                                                              |

There is no `PATCH`, `PUT` or `DELETE` on any audit route, and the conformance test keeps it so.

---

## 8. Detailed implementation backlog

### Task ID map

| Epic                               | Tasks                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| 13 Audit Log Foundation            | 13.1 = SD-65, 13.2 = SD-66, 13.3 = SD-67, 13.4 = SD-68                             |
| 14 Event Recording                 | 14.1 = SD-69, 14.2 = SD-70, 14.3 = SD-71, 14.4 = SD-72, 14.5 = SD-73               |
| 15 Log Browser and Export          | 15.1 = SD-74, 15.2 = SD-75, 15.3 = SD-76                                           |
| 16 Integrity and Log Protection    | 16.1 = SD-77, 16.2 = SD-78, 16.3 = SD-79, 16.4 = SD-80, 16.5 = SD-81, 16.6 = SD-82 |
| 17 Detection and Alerts            | 17.1 = SD-83, 17.2 = SD-84, 17.3 = SD-85, 17.4 = SD-86, 17.5 = SD-87               |
| 18 Extra, Verification, Submission | 18.1 = SD-88, 18.2 = SD-89, 18.3 = SD-90, 18.4 = SD-91, 18.5 = SD-92               |

---

## EPIC 13 — Audit log foundation

### SD-65 / Task 13.1 — Audit log schema, immutability triggers and permissions

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] C-04, [VARIANT], database, security · **Depends on:** Module 2 (SD-33)

**Objective:** Create the table that holds the audit trail and make the database itself refuse to change or remove its rows. Variant 2 stores the log in a table of the existing database; a separate table from `security_events` is needed because that one is aggregated, acknowledged and purged, which an audit log must never be.

**Implementation checklist**

- Drizzle schema `apps/backend/src/server/db/schema/audit-log.ts` with the columns, `AUTOINCREMENT` primary key, indexes and CHECK constraints of section 4.1; export from `schema/index.ts`; migration `0006_*` via `npm run db:generate`.
- A custom SQL migration file (precedent: `0001_protect_admin_account.sql`) creating `audit_log_no_update` (`BEFORE UPDATE`) and `audit_log_no_delete` (`BEFORE DELETE`) triggers with `RAISE(ABORT, 'audit_log is append-only')`.
- Add `audit-log:read`, `audit-log:export`, `audit-log:verify` to `permissions/codes.ts`, descriptions and the Administrator mapping in `permissions/matrix.ts`; update `docs/permissions.md` (the doc-sync test must stay green) and `matrix.test.ts`.
- Update `docs/database-schema.md` / `.mmd` and the ER-diagram test.

**Acceptance criteria**

- [ ] `npm run db:migrate` applies cleanly to an empty database and to a Module 2 database; existing rows survive; `PRAGMA foreign_key_check` is empty.
- [ ] Any `UPDATE audit_log` and any `DELETE FROM audit_log` statement fails with the trigger message (SEC-76).
- [ ] A row with an unknown `outcome` or `actor_type`, or a hash that is not 64 characters, is refused by the database.
- [ ] `matrix.test.ts` proves Administrator holds exactly the three new codes and the other roles none; `docs/permissions.md` and the ER diagram match the schema.
- [ ] Minimum 80% test coverage for this module.

### SD-66 / Task 13.2 — Canonical entry format and SHA-256 hash-chain append

**Priority:** P0 · **Size:** L · **Labels:** [VARIANT] C-03, backend, security · **Depends on:** SD-65

**Objective:** Implement the integrity mechanism of variant 2: every entry's hash covers its content and the previous entry's hash, stored in a column of the same table, so any later change breaks the chain from that point.

**Implementation checklist**

- `server/audit/chain.ts`: `GENESIS_HASH`, `canonicalize(entry)` (section 6.1, version prefix `sd-audit-v1`, sorted-key canonical details), `computeEntryHash(prevHash, canonical)` with `node:crypto` SHA-256, hex output.
- `server/audit/append.ts`: `appendAuditEntry(tx, entry)`: inside one `IMMEDIATE` transaction (or a savepoint when the caller already has one) read the newest `(seq, entry_hash)`, take the next `seq` from `sqlite_sequence`, hash, insert; no `await` between the read and the insert. Time comes from the injected clock, formatted as UTC ISO-8601 with milliseconds.
- A test-only independent implementation of the hash formula (duplicated on purpose) so an accidental change of the format fails a test instead of silently invalidating old logs.
- Document the format and an independent verification snippet in `docs/architecture.md`.

**Acceptance criteria**

- [ ] The first entry has `prev_hash` of 64 zeros; every later entry's `prev_hash` equals the previous `entry_hash` (SEC-75).
- [ ] 50 concurrent appends produce a gapless `seq` series and a valid chain (SEC-74).
- [ ] The independent test implementation reproduces every stored `entry_hash`; changing one field, the field order or the version prefix changes the hash.
- [ ] `occurred_at` is UTC ISO-8601 from the injected clock and is part of the hashed content.
- [ ] Minimum 80% test coverage for this module.

### SD-67 / Task 13.3 — Event catalogue, strict details schemas, sanitization and privacy rules

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] C-01, backend, security · **Depends on:** SD-65

**Objective:** Make the shape of every entry known and safe: a closed list of actions, a strict schema for each action's details, one sanitizer against log injection and one rule for the typed login of unknown accounts. The PDF names both log injection and the ban on logging passwords, so both are enforced in code, not by convention.

**Implementation checklist**

- `server/audit/events.ts`: registry `AUDIT_ACTIONS` implementing section 6.2: per action the allowed outcomes, a strict Zod `details` schema (reason enums, ids, counts, from/to values) and a description template that uses only validated fields. Reject unknown actions and unknown keys; refuse any key matching `/password|token|secret|answer|captcha/i` at any depth (same guard as `security/events.ts`).
- `server/audit/sanitize.ts`: `sanitizeForLog(text, maxLength)` escapes CR, LF, C0/C1 controls, DEL, U+2028/U+2029, bidi controls (U+202A–U+202E, U+2066–U+2069, U+200E/U+200F) and zero-width characters as visible `\uXXXX`, then truncates; applied to every string that came from a user, including `actor_login`.
- `server/audit/subject.ts`: `subjectFor(normalizedLogin, accountExists)` returns `{ subjectLogin }` for an existing account or the registered trap login and `{ subjectRef }` (`ref:` + 16 hex of HMAC-SHA256 with `AUDIT_SUBJECT_PEPPER`) otherwise. The start-up check refuses a missing or placeholder pepper in production.
- Add `AUDIT_SUBJECT_PEPPER` to `.env.example` and the production start-up checks.

**Acceptance criteria**

- [ ] A login attempt named `admin\n2026-11-26T00:00:00.000Z AUTH_LOGIN_SUCCESS ok` produces one entry whose stored text contains no raw newline and whose description is unchanged by it (SEC-66).
- [ ] An entry with an undeclared action, an extra `details` key or a key named `password` is refused.
- [ ] A failed login for an unknown account stores only `ref:…`, never the typed text; for an existing account it stores the login (SEC-65).
- [ ] Bidi and zero-width characters are escaped visibly; output is stable and length-bounded.
- [ ] Minimum 80% test coverage for this module.

### SD-68 / Task 13.4 — Audit context and write policy (transactional, fail closed)

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] C-01, C-04, backend, security · **Depends on:** SD-66, SD-67, Module 2 (SD-34)

**Objective:** Give every handler an `AuditContext` (who, from where, which request) and one recording helper with a defined failure policy, so recording is uniform, cannot be forgotten at the edges and cannot be switched off.

**Implementation checklist**

- `defineRoute` builds `AuditContext { actorType, actorUserId, actorLogin, ip, requestId }` from the resolved session and `client-ip.ts` (the **raw** address, not the `/64` key) and passes it to the handler as `context.audit`.
- `audit.record(txOrDb, { action, outcome, details, subject? })` binds the context, validates, sanitizes, hashes and appends. State-changing services call it with their own transaction handle so the change and the entry commit together.
- Failure policy (section 6.1): on a state change, a successful login or a password change a failed write aborts the operation with `500 AUDIT_UNAVAILABLE`; on a refusal the failure goes to the operational log and the refusal is still returned. Add `AuditUnavailableError` to `http/errors.ts`.
- `SYSTEM` actor for the seed and maintenance code (no session): `actor_type = 'SYSTEM'`.
- There is no flag, setting or environment variable that skips recording; tests use the same code path with a temporary database.

**Acceptance criteria**

- [ ] If the state change rolls back after the entry was written in the same transaction, neither the change nor the entry exists (SEC-72).
- [ ] With a fault injected into the append, a login does not create a session and an admin user creation changes nothing; the response is the generic `AUDIT_UNAVAILABLE` (SEC-73).
- [ ] With a fault injected into the append, an access denial still returns its `403` and the failure appears only in the operational log.
- [ ] The raw IP address, the actor's user id and login and the request id are present in entries written through a route; seed and maintenance entries have `actor_type = 'SYSTEM'`.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 14 — Event recording

### SD-69 / Task 14.1 — Authentication events

**Priority:** P0 · **Size:** L · **Labels:** [ASSIGNMENT] C-01, backend, security, authentication · **Depends on:** SD-68, Module 2 (SD-37, SD-38, SD-54)

**Objective:** Record every way a login attempt ends, a logout, a session expiry, an account lock and the use of the trap account, with the fields the PDF requires: user, UTC time, IP address, action, description and result.

**Implementation checklist**

- In `login-guard.ts` / `login-service.ts` write `AUTH_LOGIN_FAILURE` with the reason for each refusal (`BAD_CREDENTIALS`, `ACCOUNT_LOCKED`, `CAPTCHA_FAILED`, `HONEYPOT`, `IP_BLOCKED`), using `subjectFor()` so an unknown login is stored only as a reference. The IP-block refusal is written once per address per 5-minute bucket.
- `AUTH_LOGIN_SUCCESS` is written in the **same transaction** that creates the session, so there is no session without an entry. The responses stay byte-identical to Module 2 (no information is added for the client).
- `AUTH_ACCOUNT_LOCKED` (actor `SYSTEM`) at the transition in `attempt-tracker.ts`, next to the existing `ACCOUNT_LOCKED` security event.
- `AUTH_TRAP_ACCOUNT_USED` when the honeytoken stage matches the trap login, in addition to the Module 2 event; the login still follows the unknown-login path, so the response is unchanged.
- `AUTH_LOGOUT` in `logout/route.ts`; `AUTH_SESSION_EXPIRED` when `session-service` revokes a session for inactivity or absolute expiry.
- Document in `docs/architecture.md` which failures feed the detection rules (section 6.5).

**Acceptance criteria**

- [ ] Each outcome of a login attempt (success, wrong password, unknown login, lock refusal, CAPTCHA failure, honeypot, IP block) produces exactly the documented entry, with outcome, reason, raw IP and UTC time (SEC-63, SEC-64, SEC-67).
- [ ] A successful login writes its entry in the same transaction as the session; with the append failing, no session exists (SEC-73).
- [ ] The trap-account response is still byte-identical to an unknown login (the Module 2 SEC-34 test stays green) and `AUTH_TRAP_ACCOUNT_USED` is recorded (SEC-67).
- [ ] No entry contains the submitted password, a hash or a session token (a scan over every stored row after the full outcome matrix).
- [ ] 1000 refused attempts from one blocked address create one entry per 5-minute bucket, not 1000.
- [ ] Minimum 80% test coverage for this module.

### SD-70 / Task 14.2 — Password events

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] C-01, backend, security, authentication · **Depends on:** SD-68, Module 1 (SD-09, SD-11)

**Objective:** The PDF asks for password changes "also failed". Record every success and failure of the forced initial change, the ordinary change and the administrator reset, with reason codes and no password material.

**Implementation checklist**

- `password-service.ts`: `PASSWORD_CHANGED` (kind `INITIAL`, `ORDINARY` or `EXPIRED`) written in the same transaction as the credential swap; `PASSWORD_CHANGE_FAILED` for `CURRENT_PASSWORD_INCORRECT`, `POLICY_VIOLATION` (with the violation codes only), `REUSED`, `TEMPORARY_PASSWORD_EXPIRED`, plus `CAPTCHA_FAILED` (route level) and `BRUTE_FORCE_LIMIT` (Module 2 SD-42).
- `PASSWORD_RESET_BY_ADMIN` in `account-service.ts` (actor the administrator, subject the target), in the reset transaction; the temporary password is never part of `details`.
- The Module 1 and 2 responses and rules are unchanged.

**Acceptance criteria**

- [ ] A successful ordinary change, a successful initial change and an expired-password change each produce a `PASSWORD_CHANGED` entry of the right kind (SEC-68).
- [ ] A wrong current password, a policy violation, a reuse and a missing CAPTCHA each produce a `PASSWORD_CHANGE_FAILED` entry with the right reason and no password text (SEC-68).
- [ ] An administrator reset produces `PASSWORD_RESET_BY_ADMIN` with actor and target, and the stored row contains no temporary password (a scan over the row).
- [ ] The entry and the credential change commit together: forcing the swap to fail leaves no success entry.
- [ ] Minimum 80% test coverage for this module.

### SD-71 / Task 14.3 — User administration events

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] C-01, admin, backend, security · **Depends on:** SD-68, Module 1 (SD-17, SD-18, SD-19), Module 2 (SD-41)

**Objective:** Create, update, role change, block, unblock, delete, unlock and TOTP reset are the actions an attacker with an administrator session would use; each must leave an entry that says who did what to whom.

**Implementation checklist**

- In `user-service.ts` and `account-service.ts` write `USER_CREATED`, `USER_UPDATED` (the changed field names, never values of credentials), `USER_ROLE_CHANGED` (from and to role ids), `USER_BLOCKED`, `USER_UNBLOCKED`, `USER_DELETED`, `USER_UNLOCKED` (admin unlock of Module 2) and `USER_TOTP_RESET`, each inside the transaction that performs the change.
- Protected-account refusals (blocking or deleting `ADMIN`, Module 1 SEC-29) are recorded as `FAILURE` entries with reason `PROTECTED_ACCOUNT`.
- A `PATCH` that changes both name and role writes both a `USER_UPDATED` and a `USER_ROLE_CHANGED` entry.

**Acceptance criteria**

- [ ] Each of the eight actions writes one entry with actor id and login, subject login, raw IP, UTC time and `SUCCESS` (SEC-69).
- [ ] A role change records the old and the new role (SEC-69).
- [ ] A refused attempt to block or delete `ADMIN` writes a `FAILURE` entry and changes nothing.
- [ ] The entry and the change commit together, and no entry contains a temporary password or hash.
- [ ] Minimum 80% test coverage for this module.

### SD-72 / Task 14.4 — Settings, access denial, TOTP and decoy events

**Priority:** P0 · **Size:** L · **Labels:** [ASSIGNMENT] C-01, backend, security · **Depends on:** SD-68, Module 2 (SD-36, SD-55)

**Objective:** Cover the remaining items of the PDF's list: settings changes and access denials, plus TOTP and decoy events that complete the picture.

**Implementation checklist**

- `settings-service.ts`: `SETTINGS_CHANGED` with one `{ key: { from, to } }` per changed setting, in the same transaction; the Module 2 `SECURITY_SETTINGS_CHANGED` security event stays.
- `route-handler.ts`: record `ACCESS_DENIED` where `ForbiddenError`, `PasswordChangeRequiredError`, `TotpChallengeRequiredError` and the CSRF refusals are mapped (`reason` `PERMISSION`, `STAGE`, `TOTP_REQUIRED`, `CSRF`), with the route name and the actor. A request with **no** valid session (`401`) is not recorded individually.
- `OBJECT_ACCESS_DENIED` where the ticket policy answers `404` for an object the actor may not read (resource kind only, never the content); the response stays `404`.
- TOTP: `TOTP_ENROLLED`, `TOTP_DISABLED` and `AUTH_TOTP_CHALLENGE` (success and failure) in the TOTP routes and service.
- `DECOY_RESOURCE_ACCESSED` entry at the decoy endpoint, next to the Module 2 event.

**Acceptance criteria**

- [ ] Changing two settings writes one `SETTINGS_CHANGED` entry listing both keys with old and new values (SEC-70).
- [ ] A Guest calling `GET /api/admin/users` writes `ACCESS_DENIED` with the Guest as actor, the route name and reason `PERMISSION`; an anonymous call writes nothing (SEC-71).
- [ ] A forged-origin request, a restricted-stage call and a TOTP-stage call each write the matching reason (SEC-71).
- [ ] An object-level ticket denial writes `OBJECT_ACCESS_DENIED` and the HTTP answer is unchanged.
- [ ] TOTP enrollment, disabling and a wrong challenge code are recorded without any secret or code.
- [ ] Minimum 80% test coverage for this module.

### SD-73 / Task 14.5 — Recording coverage guard

**Priority:** P1 · **Size:** M · **Labels:** [HARDENING] C-01, testing, security · **Depends on:** SD-69, SD-70, SD-71, SD-72

**Objective:** A new mutating endpoint that forgets to write an audit entry is exactly how an audit trail develops holes. A test must fail when one is added without a decision.

**Implementation checklist**

- `tests/audit-coverage.test.ts`: scan `apps/backend/src/app/api/**/route.ts` for exported `POST`, `PATCH`, `PUT` and `DELETE` handlers and compare them with a registry `AUDIT_COVERAGE` (route name → audit actions it must write, or an explicit, reviewed reason for none, such as `auth.captcha.challenge`).
- A table-driven integration test calls each registered mutating route in the test harness with a valid sample request and asserts that at least one entry of a declared action was appended.
- The test fails for an unregistered mutating route and for a registered route that writes nothing.

**Acceptance criteria**

- [ ] Adding a temporary `POST` route without a registry entry makes the test fail (verified once, noted in the pull request).
- [ ] Every mutating route of Modules 1 to 3 is either mapped to actions or carries a written exemption.
- [ ] Removing the audit call from one route makes its row fail.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 15 — Log browser and export

### SD-74 / Task 15.1 — Audit log read API

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] C-02, admin, backend · **Depends on:** SD-65, SD-67

**Objective:** Let the administrator list the entries and filter them by user, date and event type, and only the administrator.

**Implementation checklist**

- `GET /api/admin/audit-log` (`audit-log:read`) in `app/api/admin/audit-log/route.ts`, strict query: `user` (matches actor login, subject login or actor id; `LIKE` metacharacters escaped), `action` (one or more values from the catalogue), `outcome`, `from`, `to` (ISO-8601 UTC; `from ≤ to`), `page`, `pageSize` ≤ 100; newest first by `seq`.
- `GET /api/admin/audit-log/[seq]` for one entry.
- Explicit DTO mapper (no raw rows) including `seq`, `id`, `occurredAt`, actor, subject, `ip`, `action`, `description`, `outcome`, `details`, `prevHash`, `entryHash`. The service lives in `server/audit/queries.ts` with parameterized queries only.
- `AUDIT_LOG_VIEWED` entry at most once per administrator session per 5 minutes.

**Acceptance criteria**

- [ ] The Administrator filters by user, by date range and by action and receives exactly the matching entries; paging and ordering are stable (SEC-79).
- [ ] Manager, Employee and Guest receive `403`, anonymous `401`; the route is in `admin-routes-authz.test.ts` (SEC-79).
- [ ] `user=%` and `user=_` match only literal characters; `pageSize=1000` is rejected; `from` after `to` is `400`.
- [ ] Viewing writes at most one `AUDIT_LOG_VIEWED` entry per session per 5 minutes (fake clock).
- [ ] Minimum 80% test coverage for this module.

### SD-75 / Task 15.2 — Audit log export

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] C-02, admin, backend, security · **Depends on:** SD-74

**Objective:** Export the filtered entries to a file for the auditor of the organization and for the report. The export itself is an operation on the log and is recorded before any data leaves.

**Implementation checklist**

- `POST /api/admin/audit-log/export` (`audit-log:export`, CSRF required) with the filter body of SD-74 and `format: 'csv' | 'jsonl'`; POST so a link or an `<img>` cannot trigger it and the user filter does not enter URLs.
- Count first; above `AUDIT_EXPORT_MAX_ROWS` answer `400 EXPORT_TOO_LARGE`. Write `AUDIT_LOG_EXPORTED` (filters, format, row count, first and last `seq`) **before** streaming; if that write fails, nothing is sent.
- Stream in batches with `Content-Disposition: attachment; filename="audit-log-<UTC timestamp>.<ext>"`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. CSV: RFC 4180 quoting, UTF-8, header row, columns including `seq`, `prev_hash`, `entry_hash`; any cell that starts with `=`, `+`, `-`, `@`, tab or carriage return is prefixed with `'` (spreadsheet formula injection). JSON Lines: one entry per line, with the hashes, so an export can be verified offline with the documented snippet.

**Acceptance criteria**

- [ ] The exported file contains exactly the filtered entries, in order, with their hashes, in both formats (SEC-80).
- [ ] An entry whose text starts with `=HYPERLINK(...)` is exported with a neutralising prefix and never as a live formula (SEC-80, SEC-66).
- [ ] The `AUDIT_LOG_EXPORTED` entry exists before the stream starts and records the filters, the format and the row count (SEC-81).
- [ ] Non-admin roles get `403`; an over-large range gets `400 EXPORT_TOO_LARGE`.
- [ ] Recomputing the chain from an exported JSON Lines file with the documented snippet agrees with the stored hashes.
- [ ] Minimum 80% test coverage for this module.

### SD-76 / Task 15.3 — Angular audit log browser

**Priority:** P0 · **Size:** L · **Labels:** [ASSIGNMENT] C-02, admin, frontend · **Depends on:** SD-74, SD-75

**Objective:** The administrator's page for investigating events: filters, a table with UTC times, details and export buttons.

**Implementation checklist**

- `features/admin-audit-log/audit-log.component.ts` (Angular 22.x standalone, Reactive Forms): filters for user, UTC date-time range (the inputs are labelled "UTC" and values are sent as UTC), action and outcome; table with `seq`, UTC time, actor, subject, IP, action, description, outcome badge; row detail drawer with the JSON `details` and both hashes; pagination; loading, empty and error states.
- Export buttons for CSV and JSON that `POST` the active filters and save the blob; the file name comes from `Content-Disposition`.
- Route `/admin/audit-log` guarded by `audit-log:read` in `app.routes.ts`, nav entry in `nav-items.ts` (their spec checks that the nav permission equals the route permission), methods in `core/http/admin-api.service.ts`, error texts in English.
- Render every value with interpolation only; no `[innerHTML]`, no `bypassSecurityTrust*` (the existing lint rule applies).
- A slot for the integrity panel of SD-78.

**Acceptance criteria**

- [ ] Filtering by user, date range and action changes the request parameters and the visible rows (component test); times are shown as UTC.
- [ ] Export buttons send a `POST` with the active filters and trigger a download (spec with a faked blob).
- [ ] Entries whose text contains `<script>` or an escaped newline render as literal text.
- [ ] Non-admin roles see no nav entry and are redirected from the route to `/forbidden`.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 16 — Integrity and log protection

### SD-77 / Task 16.1 — Chain verification service

**Priority:** P0 · **Size:** L · **Labels:** [VARIANT] C-03, backend, security · **Depends on:** SD-66

**Objective:** Check the whole log and say either "intact" or "tampering detected" with the entry concerned, which is what the PDF asks the administrator's verification to show.

**Implementation checklist**

- `server/audit/verify.ts`: `verifyAuditChain(db, options)` reads entries ordered by `seq` in batches (default 1000), yielding to the event loop (`setImmediate`) between batches, and checks: the first entry's `prev_hash` equals the genesis hash; every `entry_hash` equals the recomputation from `prev_hash` and the stored content; every `prev_hash` equals the previous stored `entry_hash`; `seq` increases by exactly one; hashes are 64 hex.
- Result: `{ status: 'INTACT', checkedEntries, headSeq, headHash, durationMs }` or `{ status: 'TAMPERED', checkedEntries, firstProblem: { seq, id, kind }, problems (at most 20) }` with `kind` in `HASH_MISMATCH`, `CHAIN_BROKEN`, `SEQUENCE_GAP`, `GENESIS_MISMATCH`, `MALFORMED_ROW`.
- A single-flight guard: a second verification while one runs gets `409 VERIFICATION_IN_PROGRESS`.
- Extension point for the head-anchor check of SD-79.

**Acceptance criteria**

- [ ] An untouched log returns `INTACT` with the right entry count (SEC-82).
- [ ] Changing one field of an entry (triggers dropped in the test) returns `TAMPERED` with that entry's `seq` and `HASH_MISMATCH` (SEC-83).
- [ ] Deleting an entry from the middle returns `TAMPERED` at the first entry after the hole with `SEQUENCE_GAP` or `CHAIN_BROKEN` (SEC-84).
- [ ] A log of 100,000 entries verifies in under 10 seconds and no batch blocks the event loop for more than 50 ms.
- [ ] A concurrent second call is refused with `VERIFICATION_IN_PROGRESS`.
- [ ] Minimum 80% test coverage for this module.

### SD-78 / Task 16.2 — Verification API and administrator UI

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] C-03, admin, backend, frontend · **Depends on:** SD-76, SD-77

**Objective:** The administrator starts the verification and sees the result: green "log intact" or red "tampering detected" naming the entry.

**Implementation checklist**

- `POST /api/admin/audit-log/verify` (`audit-log:verify`, CSRF required) runs the service and returns the result; afterwards it appends `AUDIT_LOG_VERIFIED` (outcome `SUCCESS` when intact, `FAILURE` when tampered; details: entries checked, the first problem). The result describes the log as it was before that append.
- `GET /api/admin/audit-log/integrity` (`audit-log:read`) returns the latest verification result and time from the newest `AUDIT_LOG_VERIFIED` entry.
- Angular integrity panel on `/admin/audit-log`: "Verify integrity" button (disabled while running), result banner (green or red), the first problem with its `seq`, id and kind and a link that filters the table to that entry, and "last verified at".
- Texts in English, status icons not colour-only.

**Acceptance criteria**

- [ ] Verification of an untouched log shows "Log intact" and the count; the run is recorded as a `SUCCESS` entry (SEC-81, SEC-82).
- [ ] After a manual modification the same button shows "Tampering detected" with the entry's `seq` and kind; the run is recorded as a `FAILURE` entry (SEC-83).
- [ ] Non-admin roles get `403` on both routes; a second click during a run shows the in-progress message.
- [ ] The panel is operable by keyboard and the result is announced in a live region.
- [ ] Minimum 80% test coverage for this module.

### SD-79 / Task 16.3 — Head anchor file and tail-truncation detection

**Priority:** P1 · **Size:** M · **Labels:** [HARDENING] C-03, backend, security · **Depends on:** SD-77

**Objective:** A chain alone cannot see the end of the log being cut off. A copy of the newest `(seq, entry_hash)` outside the database closes that gap and raises the cost of rewriting history.

**Implementation checklist**

- `server/audit/anchor.ts`: after each commit write `{ seq, hash, writtenAt }` to `AUDIT_ANCHOR_PATH` atomically (temporary file, then rename), mode `0600`, directory `0700`, outside every public or frontend directory; ignore the path in `.gitignore`.
- Verification (SD-77) adds: the anchored entry must exist at its `seq` with the same hash (`HEAD_MISMATCH` otherwise); a database head below the anchor is truncation; an anchor file that is missing while the log is not empty is reported as a warning `ANCHOR_MISSING`, not as tampering.
- A crash between commit and anchor write leaves the anchor behind the head, which is valid and not a false alarm.
- Document that a host-level attacker who can rewrite both the database and the anchor defeats it, and that an off-host copy (SD-89) is the answer.

**Acceptance criteria**

- [ ] Deleting the last N entries (triggers dropped in the test) is reported as `TAMPERED` with `HEAD_MISMATCH` (SEC-85).
- [ ] Rewriting history before the anchored entry is detected by the anchor check even when the attacker recomputes later hashes (SEC-86).
- [ ] An anchor that is behind the database head produces `INTACT`; a missing anchor produces a warning, not a failure.
- [ ] The anchor file has mode `0600`, is git-ignored and contains no entry content.
- [ ] Minimum 80% test coverage for this module.

### SD-80 / Task 16.4 — Scheduled verification and tamper alert

**Priority:** P1 · **Size:** M · **Labels:** [HARDENING] C-03, C-05, backend, security · **Depends on:** SD-77, SD-83

**Objective:** Tampering that nobody looks for goes unnoticed. Verify periodically and alert when the log is found altered.

**Implementation checklist**

- `verifyIfDue(db)` called from the write path, throttled like `purgeIfDue` to `AUDIT_VERIFY_INTERVAL_MINUTES` (default 60); the state survives restarts because it reads the newest `AUDIT_LOG_VERIFIED` entry.
- On `TAMPERED`: append `AUDIT_TAMPER_DETECTED` (outcome `FAILURE`, first problem), raise a `CRITICAL` `DETECTION_ALERT` through the engine of SD-83 and dispatch it (alert file, optional webhook); alert once per distinct first-problem signature until it changes.
- CLI `npm run audit:verify` (shared service) exits `0` when intact and `1` when tampered, for cron and CI.

**Acceptance criteria**

- [ ] With the fake clock, a due verification runs once per interval and an intact log produces only an `AUDIT_LOG_VERIFIED` entry.
- [ ] After tampering, the next due verification records `AUDIT_TAMPER_DETECTED` and one `CRITICAL` alert reaches the alert file (SEC-87).
- [ ] The same tampering does not re-alert on every interval.
- [ ] `npm run audit:verify` returns the right exit code in both cases.
- [ ] Minimum 80% test coverage for this module.

### SD-81 / Task 16.5 — Log protection guarantees

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] C-04, security, testing, backend · **Depends on:** SD-65, SD-68

**Objective:** The PDF requires that recording cannot be disabled and that the application offers no editing or deleting of entries. Make that a property that tests and lint rules enforce, not a promise.

**Implementation checklist**

- `tests/audit-protection.test.ts`: the route conformance scan fails if any route under `api/**/audit-log` exports `PATCH`, `PUT` or `DELETE`; fails if a setting, an environment variable or a `security_settings` column named like `AUDIT_ENABLED`, `DISABLE_AUDIT` or `AUDIT_LEVEL` exists (scan of `.env.example`, `schemas.ts` and the settings schema); the `SecuritySettingsPatch` schema rejects any audit key.
- Extend `sql-lint.test.ts` / ESLint restricted syntax: no `.update(auditLog)`, `.delete(auditLog)` and no SQL text that updates or deletes `audit_log` outside migrations and the tamper-demo script directory.
- `purge.ts` never references `audit_log`; a test runs the purge ten years into the future with the fake clock and asserts every audit row is still there.
- `docs/architecture.md`: the honest limit: the triggers stop the application and accidents, someone with the database file can drop them, which is exactly what the chain, the anchor and a remote copy detect.

**Acceptance criteria**

- [ ] No audit route can edit or delete an entry, and adding one fails the conformance test (SEC-77).
- [ ] No configuration key, setting or flag can disable recording; a static test fails if one appears (SEC-77).
- [ ] The retention purge ten years ahead leaves every audit row in place (SEC-78).
- [ ] Introducing `db.delete(auditLog)` in application code fails lint.
- [ ] Minimum 80% test coverage for this module.

### SD-82 / Task 16.6 — Tamper demonstration tooling

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] C-03, testing, security, backend · **Depends on:** SD-77, SD-78

**Objective:** The PDF asks to demonstrate the mechanism by changing or deleting an entry by hand. Provide a safe, repeatable way to do it, including the cases a plain chain cannot catch, so the report can describe them honestly.

**Implementation checklist**

- `scripts/audit-tamper-demo.ts` (`npm run audit:tamper-demo`): works on a **copy** of the E2E database, never on the file named by `DATABASE_PATH`, and refuses `NODE_ENV=production`. Scenarios, each printing the verification result before and after: (1) modify one entry (drop the triggers first, then `UPDATE`); (2) delete an entry from the middle; (3) delete the tail; (4) modify an entry and recompute every later hash. It shows that (1) and (2) are caught by the chain, that (3) and (4) are caught only with the anchor of SD-79, and that (4) with a rewritten anchor is caught only by an off-host copy.
- A step that attempts `UPDATE` and `DELETE` with the triggers **in place** and prints the abort message (evidence for SEC-76).
- `scripts/show-audit-table.sh` prints a fragment of `audit_log` (`seq`, time, action, outcome, first 12 characters of `prev_hash` and `entry_hash`) for the screenshot.
- Document the exact manual procedure with `sqlite3` in `docs/audit-log.md`.

**Acceptance criteria**

- [ ] Running the demo prints `INTACT`, then `TAMPERED` with the entry's `seq` for scenarios 1 and 2 (SEC-83, SEC-84).
- [ ] Scenario 3 is reported by the anchor check and scenario 4 is reported only when the anchor is not rewritten, and the output says so (SEC-85, SEC-86).
- [ ] The script refuses to run against the configured development database and in production (script test).
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 17 — Detection and alerts

### SD-83 / Task 17.1 — Detection engine and alert pipeline

**Priority:** P0 · **Size:** L · **Labels:** [ASSIGNMENT] C-05, backend, security, monitoring · **Depends on:** SD-66, Module 2 (SD-35)

**Objective:** A small, testable rule engine that watches the audit log, so the two required rules are data on top of one mechanism, and an alert always goes to the log and to the variant's channel.

**Implementation checklist**

- `server/detection/engine.ts`: `DetectionRule { id, title, severity, appliesTo: AuditAction[], evaluate({ db, entry, now }): Detection | null }`, a registry, and `runDetection(db, entry)` called right after an audit append commits. All queries are synchronous and indexed; a rule that throws is logged operationally and never fails the request that caused it.
- Raising an alert: (1) append `ALERT_RAISED` (rule id, severity, subject, window, count, first and last triggering `seq`); (2) record a `DETECTION_ALERT` security event (add it to the `SECURITY_EVENTS` registry: severity from the rule, `alert: true`, strict details) so the admin banner, acknowledgement and dispatchers apply; all three share one alert id.
- Cooldown: at most one alert per (rule, subject) per 5 minutes, decided from the last `ALERT_RAISED` entry, so a restart does not reset it.
- No recursion: `ALERT_RAISED`, `AUDIT_LOG_*` and `AUDIT_TAMPER_DETECTED` are never rule inputs.
- Injectable clock; no timers.

**Acceptance criteria**

- [ ] An alert produces one `ALERT_RAISED` entry and one `DETECTION_ALERT` security event with the same alert id (SEC-91).
- [ ] A second triggering within 5 minutes produces no second alert; after 5 minutes it does (SEC-93).
- [ ] A rule that throws does not fail or delay the triggering request.
- [ ] Raising an alert does not trigger a rule (no recursion).
- [ ] Minimum 80% test coverage for this module.

### SD-84 / Task 17.2 — Rule 1: five failed logins on one account within five minutes

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] C-05, backend, security, authentication · **Depends on:** SD-69, SD-83

**Objective:** The assignment's base rule: at least 5 failed logins on the same account within 5 minutes.

**Implementation checklist**

- `server/detection/rules/failed-login-burst.ts`, applies to `AUTH_LOGIN_FAILURE`: count entries with reason `BAD_CREDENTIALS` or `ACCOUNT_LOCKED` for the same subject (`subject_login`, or `subject_ref` for an unknown login) in the window `(now − 5 min, now]`; `≥ 5` raises a `WARNING` alert.
- Refusals caused by the Module 2 lock count, so a low administrator lock threshold (3 or 4) cannot hide the pattern.
- Constants `5` and `5 minutes` live in the rule file; the admin rule listing shows them (SD-87).

**Acceptance criteria**

- [ ] Five failures within 5 minutes raise exactly one alert; four do not (SEC-88).
- [ ] The fifth failure at 5 min 01 s after the first does not count the first one (fake clock boundary) (SEC-88).
- [ ] With the lock threshold set to 3, five attempts (three failures, two lock refusals) still raise the alert (SEC-89).
- [ ] Failures spread over different accounts do not raise this rule.
- [ ] Minimum 80% test coverage for this module.

### SD-85 / Task 17.3 — Rule 2 (variant 2): successful login right after three failed attempts

**Priority:** P0 · **Size:** M · **Labels:** [VARIANT] C-05, backend, security, authentication · **Depends on:** SD-69, SD-83

**Objective:** The variant's rule: a successful login immediately after at least 3 failed attempts on the same account is the signature of a guessed password.

**Implementation checklist**

- `server/detection/rules/success-after-failures.ts`, applies to `AUTH_LOGIN_SUCCESS`: look back from the success for `AUTH_LOGIN_FAILURE` entries with reason `BAD_CREDENTIALS` for the same account **since its previous success**; if there are at least 3 consecutive such failures and all lie within the preceding 10 minutes (decision D-03), raise a `CRITICAL` alert.
- Failures of other reasons (CAPTCHA, honeypot, IP block) are not inputs; a success in between resets the sequence.
- Details: account, number of failures, time since the first of them.

**Acceptance criteria**

- [ ] Three wrong passwords followed by a correct one raise exactly one `CRITICAL` alert; two wrong passwords followed by a correct one raise none (SEC-90).
- [ ] Three failures, a success, then another success raise one alert, not two (SEC-90).
- [ ] Failures older than 10 minutes before the success do not raise the alert (fake clock) (SEC-90).
- [ ] CAPTCHA failures between the wrong passwords do not count and do not reset the sequence.
- [ ] Minimum 80% test coverage for this module.

### SD-86 / Task 17.4 — Alert channel of variant 2: separate alert file

**Priority:** P0 · **Size:** M · **Labels:** [VARIANT] C-05, backend, security, monitoring · **Depends on:** SD-83, Module 2 (SD-35)

**Objective:** Variant 2 sends alerts to a separate alert file. Implement it as an `AlertDispatcher` so it plugs into the existing pipeline next to the optional webhook.

**Implementation checklist**

- `server/alerts/file-alert-dispatcher.ts` implementing `AlertDispatcher` (`id: 'detection-alert-file'`), registered at start-up with the other dispatchers; it handles only `DETECTION_ALERT` events.
- Appends one JSON line per alert to `ALERT_FILE_PATH` (`{ alertId, ruleId, severity, time, subject, count, windowMinutes, auditSeq }`, time in UTC), opened in append mode, file `0600`, directory `0700`; every string sanitized as in SD-67; no request content.
- The path is validated at start-up: not under `apps/frontend`, not under any `public` directory; the directory is git-ignored.
- A write failure makes the dispatcher throw, so the existing machinery records `alert_status = FAILED` while the audit entry and the security event remain.

**Acceptance criteria**

- [ ] An alert appends exactly one valid JSON line to the file and sets `alert_status = SENT` (SEC-91, SEC-92).
- [ ] The alert id in the file equals the id of the `ALERT_RAISED` entry and of the security event (SEC-91).
- [ ] An alert for a login named with newline or control characters produces one line without raw control characters (SEC-66).
- [ ] An unwritable path gives `alert_status = FAILED` and the triggering request is unaffected (SEC-92).
- [ ] A path under a public or frontend directory is refused at start-up.
- [ ] Minimum 80% test coverage for this module.

### SD-87 / Task 17.5 — Alert visibility in the admin UI

**Priority:** P1 · **Size:** M · **Labels:** [DESIGN] C-05, admin, frontend, backend, monitoring · **Depends on:** SD-76, SD-83, Module 2 (SD-59)

**Objective:** Alerts exist in three places; the administrator needs to see them and the rules behind them without reading files.

**Implementation checklist**

- `GET /api/admin/detection-rules` (`audit-log:read`): rule id, title, severity, thresholds, window and last alert time; read-only.
- Angular: a "Detection rules" panel on the audit page, `DETECTION_ALERT` shown with its rule title on the existing security events page, a link from an alert to the triggering entries (the audit page filtered by the alert's `seq` range), and the existing critical banner covering `CRITICAL` detection alerts.

**Acceptance criteria**

- [ ] The panel lists both rules with their thresholds and last alert time; other roles get `403` from the endpoint.
- [ ] After a rule 2 alert the banner appears on the next navigation and disappears after acknowledgement.
- [ ] The link from an alert opens the audit log filtered to the triggering entries.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 18 — Extra credit, verification and submission

### SD-88 / Task 18.1 — Canarytokens webhook receiver (extra)

**Priority:** P1 · **Size:** L · **Labels:** [EXTRA] C-06, backend, security, monitoring · **Depends on:** SD-68, Module 2 (SD-53, SD-54, SD-55)

**Objective:** Let Canarytokens call the application when a token fires, so the alert reaches the audit log and the admin UI and not only an e-mail inbox. Pick this or SD-89 for the extra credit (or both).

**Implementation checklist**

- `POST /api/webhooks/canarytokens/[secret]`: constant-time comparison of the path secret with `CANARYTOKENS_WEBHOOK_SECRET`; `404` for a wrong secret so the route does not reveal itself; JSON only, body at most 16 KB; strict-but-lenient parse of the fields Canarytokens sends (verify the payload format against the current Canarytokens documentation before coding); the memo of the token carries the convention `securedesk:<honeytoken-id>` to map it to a Module 2 honeytoken.
- **CSRF exemption is explicit:** `assertCsrfProtection` demands a matching `Origin` for every state-changing request, and a webhook has none. Add a reviewed `csrf: 'webhook'` route option that is allowed only together with a secret-based check, and a separate allowlist in `route-guard-conformance.test.ts`; add the route to the public-route allowlist.
- On a valid alert: write `HONEYTOKEN_ALERT_RECEIVED` and a `HONEYTOKEN_TRIGGERED` security event with `source = CANARYTOKENS_WEBHOOK`. **Do not** call the outbound Canarytokens alert URL for this event: Module 2 already calls it for the account trap, and a reply would create a loop between the two systems.
- Replay and flood guard: deduplicate identical payloads for 5 minutes; rate-limit the route with `SlidingWindowRateLimiter`.
- Document in `docs/canarytokens.md` how to point a token's webhook at the application. A local instance needs a public tunnel (for example Cloudflare Tunnel); the automated tests use a fixture payload.

**Acceptance criteria**

- [ ] A valid payload for the account-trap token creates one audit entry and one `CRITICAL` security event, and no outbound call is made (SEC-94).
- [ ] A wrong secret returns `404`, an oversized or non-JSON body is rejected, and a replay within 5 minutes is suppressed (SEC-94).
- [ ] The route is the only one on the CSRF-exempt allowlist; a second one fails the conformance test.
- [ ] The secret never appears in a log line or an audit entry.
- [ ] Minimum 80% test coverage for this module.

### SD-89 / Task 18.2 — Ship the audit log to Grafana Loki (extra)

**Priority:** P1 · **Size:** L · **Labels:** [EXTRA] C-06, backend, devops, monitoring · **Depends on:** SD-66

**Objective:** Send the audit entries to an external log system, which is also the off-host copy that makes rewriting the local log detectable. Grafana Loki runs locally in Docker and shows the result; Wazuh would follow the same shipper contract. Pick this or SD-88 for the extra credit (or both).

**Implementation checklist**

- `docker-compose.observability.yml` with Loki and Grafana bound to `127.0.0.1`, a provisioned Loki data source and a small dashboard (failed logins per minute, alerts).
- `server/audit/ship-loki.ts`: a cursor (last shipped `seq`, kept in a one-row table or a small file) and a shipper that pushes batches to `POST ${LOKI_PUSH_URL}/loki/api/v1/push`, labels `{ app="securedesk", stream="audit" }`, one line per entry (the JSON incl. both hashes), timestamps from `occurred_at`. The cursor advances only after a `2xx`; order is preserved; the call is fire-and-forget with timeout and capped backoff, so an outage never delays a request or loses an entry (it catches up later). Triggered from the write path (throttled) and by `npm run audit:ship`.
- Off when `LOKI_PUSH_URL` is empty; plain HTTP only for `localhost`, HTTPS otherwise; nothing secret is shipped (the entries are already free of secrets).
- Document the LogQL query used for the report and how to compare a shipped copy with the local chain.

**Acceptance criteria**

- [ ] With a stubbed Loki endpoint, new entries are delivered once, in `seq` order, with their hashes (SEC-95).
- [ ] During a simulated outage requests are not delayed; after recovery the missed entries are shipped without gaps or duplicates (SEC-95).
- [ ] Locally, `docker compose -f docker-compose.observability.yml up` plus the documented LogQL query shows the failed-login entries in Grafana.
- [ ] With `LOKI_PUSH_URL` unset nothing is sent and nothing fails.
- [ ] Minimum 80% test coverage for this module.

### SD-90 / Task 18.3 — Unit and integration tests for Module 3

**Priority:** P0 · **Size:** XL · **Labels:** [ASSIGNMENT], testing, security, backend, frontend · **Depends on:** SD-65 to SD-72, SD-74 to SD-78, SD-81, SD-83 to SD-86, plus whichever of SD-73, SD-79, SD-80, SD-87 to SD-89 are built

**Objective:** Prove every rule with fast, deterministic tests and keep the SEC traceability mechanism working for SEC-63 to SEC-96.

**Implementation checklist**

- Backend tests next to the code and integration tests under `tests/integration/` with the existing temp-database helpers and the fake clock; boundary tests for both rules; the concurrency test with `Promise.all`; fault injection for the fail-closed policy; the independent hash implementation.
- Tamper scenarios use a helper that drops the triggers on the **test** database only.
- Add SEC-63 to SEC-96 to `docs/testing.md` with their proof; optional rows (SEC-94, SEC-95) are marked as belonging to the extra tasks and are listed only if those tasks are built, so the traceability check stays green either way.
- Update `tests/route-guard-conformance.test.ts` and `tests/admin-routes-authz.test.ts` for the new admin routes across the four roles.
- Mutation sanity check recorded in `docs/testing.md`: change the hash input order, remove one trigger, change `≥ 5` to `> 5`, change `≥ 3` to `> 3`, drop the `reason` filter of rule 1; each must fail at least one test.
- Frontend specs for the audit page, filters, export, integrity panel and rule panel.

**Acceptance criteria**

- [ ] `npm test` is green and the combined coverage gate (80% statements, branches, functions and lines) still holds.
- [ ] `check-sec-traceability` reports every listed SEC-63…SEC-96 as covered.
- [ ] Each mutation of the sanity list makes at least one test fail (results recorded).
- [ ] No test sleeps in real time and no test touches the development database.

### SD-91 / Task 18.4 — E2E tests and report evidence

**Priority:** P0 · **Size:** L · **Labels:** [ASSIGNMENT], testing, documentation, frontend · **Depends on:** SD-76, SD-78, SD-82, SD-85, SD-86, SD-69

**Objective:** Prove the journeys in a real browser and produce the screenshots the PDF requires, from the isolated E2E database.

**Implementation checklist**

- New specs in `tests/e2e/`: `audit-log.spec.ts` (generate events through the UI: wrong passwords, a user created, a setting changed; filter by user, date and type; export and check the downloaded file), `audit-integrity.spec.ts` (verify intact; tamper with the E2E database through the demo script helper; verify again and see the entry named; restore), `detection.spec.ts` (five wrong passwords raise rule 1; three wrong then a correct login raise rule 2; the alert is visible in the UI and in the alert file).
- Evidence in `docs/report-evidence/module-3/` (keep `scripts/check-image-locations.ts` green): `m3-01-log-browser-filter.png`, `m3-02-audit-table-fragment.png`, `m3-03-integrity-intact.png`, `m3-04-integrity-tampered.png`, `m3-05-alert-in-log.png`, `m3-06-alert-file.png`, `m3-07-exported-file.png`, `m3-08-trap-account-entry.png`; update `docs/report-evidence/README.md` with the scenario-to-file map.
- No password, token or key may be visible in any image.

**Acceptance criteria**

- [ ] The Module 3 specs pass three consecutive runs with retries disabled.
- [ ] The integrity spec shows "Log intact" before and "Tampering detected" naming the modified entry after, and the log is restored afterwards.
- [ ] All eight screenshots exist, show the real state and contain no secret.
- [ ] The alert-file screenshot shows a line whose alert id equals the `ALERT_RAISED` entry shown in the log browser.
- [ ] Minimum 80% test coverage for this module (every journey in section 11 has a spec).

### SD-92 / Task 18.5 — Documentation, threat model and the final report (Modules 1–3)

**Priority:** P0 · **Size:** L · **Labels:** [ASSIGNMENT], documentation, security · **Depends on:** all P0 items, SD-90, SD-91

**Objective:** Finish the repository documentation and produce the PDF report required by section 5 of the PDF, including conclusions that summarise the whole project (Modules 1–3).

**Implementation checklist**

- Update `README.md` (new env vars, how to read and export the log, how to run the verification and the tamper demo, where the alert file is), `docs/architecture.md` (entry format and chain, anchor, detection rules, alert channel, protection limits), `docs/database-schema.md`, `docs/permissions.md`, `docs/threat-model.md` (section 12), `docs/testing.md`, and a short `docs/audit-log.md` runbook with the manual tamper procedure.
- Write the report in Polish like Modules 1 and 2 (`docs/course/report-module-3.md`, built to PDF with `scripts/build-report.py`): introduction in own words; variant No. 2; a sample entry; the list of recorded events (section 6.2); the integrity mechanism and its limits; both detection rules and the alert channel; key code (append and hash, verification, a rule, the dispatcher); screenshots with a paragraph each; the four control answers (hints in section 14); **conclusions for the whole project**: what Modules 1 to 3 achieved together, what the layers cover, the honest limits (single-process SQLite, in-memory limiters, tamper-evident rather than tamper-proof, retention versus GDPR) and further work; the repository link. A short note on why MD5 and SHA-1 are obsolete is welcome.
- State every decision and deviation (no Auditor role, the 10-minute window of rule 2, never-delete retention, unknown logins stored only as references).

**Acceptance criteria**

- [ ] A person who has not seen the project follows the README and reproduces: events appearing in the log browser, an export, an intact verification, a detected tamper and both alerts.
- [ ] The report contains every element of PDF section 5, the variant number, a sample entry, the event list, all screenshot kinds and all four control answers in full paragraphs, and conclusions covering Modules 1 to 3.
- [ ] No credential, key, token, Canarytokens URL or webhook secret appears in the report, screenshots or docs (secret scan passes).
- [ ] The PDF is exported and the repository link is included.
- [ ] Minimum 80% test coverage for this module (documentation task: no new code; the `npm test` coverage gate stays green on the final commit).

---

## 9. Security acceptance test matrix

IDs continue the sequence of Modules 1 and 2 so `docs/testing.md` and `scripts/check-sec-traceability.ts` work unchanged. SEC-94 and SEC-95 belong to the extra tasks and are added to `docs/testing.md` only when those tasks are built.

| ID     | Scenario                                                                                   | Expected outcome                                                                                                       | Evidence                            |
| ------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| SEC-63 | A failed login                                                                             | One entry: actor or subject, UTC time, raw IP, action, description, outcome `FAILURE`; no password anywhere in the row | Integration test + table screenshot |
| SEC-64 | A successful login and a logout                                                            | Entries `AUTH_LOGIN_SUCCESS` and `AUTH_LOGOUT` with the user id                                                        | Integration test                    |
| SEC-65 | Failed login for an unknown and for an existing account                                    | Unknown: only a keyed reference, never the typed text. Existing: the login                                             | Integration test                    |
| SEC-66 | Login name with CR, LF, ANSI, bidi characters; text starting with `=`                      | One entry; control characters escaped visibly; no forged line in the log, export or alert file; no live formula        | Integration test                    |
| SEC-67 | Lock, trap-account use, CAPTCHA, honeypot and IP-block refusals                            | Each recorded with its reason; IP-block refusals once per bucket; responses unchanged                                  | Integration test                    |
| SEC-68 | Password change success (three kinds) and failure (four reasons), admin reset              | Matching entries, violation codes only, no password text                                                               | Integration test                    |
| SEC-69 | User create, update, role change, block, unblock, delete, unlock, TOTP reset               | Entries with actor, subject; role change has from and to                                                               | Integration test                    |
| SEC-70 | Two settings changed                                                                       | One entry with both keys, old and new values                                                                           | Integration test                    |
| SEC-71 | Guest calls an admin route; anonymous call; forged origin; restricted stage                | `ACCESS_DENIED` with the right reason and actor; anonymous writes nothing                                              | Integration test                    |
| SEC-72 | The state change rolls back                                                                | Neither the change nor the entry exists                                                                                | Fault-injection test                |
| SEC-73 | The audit write fails during login or user creation                                        | No session, no change, generic `AUDIT_UNAVAILABLE`; a refusal is still returned                                        | Fault-injection test                |
| SEC-74 | 50 concurrent appends                                                                      | Gapless `seq`, valid chain                                                                                             | Concurrency test                    |
| SEC-75 | Recompute every hash with an independent implementation                                    | All equal; first `prev_hash` is the genesis value                                                                      | Unit test                           |
| SEC-76 | `UPDATE` and `DELETE` on `audit_log`                                                       | Aborted by the triggers                                                                                                | DB test + demo output               |
| SEC-77 | Look for an edit/delete route or a switch to disable auditing                              | None exists; adding one fails the guard test                                                                           | Static + conformance test           |
| SEC-78 | Retention purge ten years ahead                                                            | Every audit row remains                                                                                                | Fake-clock test                     |
| SEC-79 | Read API with filters; all four roles and anonymous                                        | Correct subsets and paging; admin only                                                                                 | API test + browser screenshot       |
| SEC-80 | Export in CSV and JSON Lines                                                               | Exactly the filtered entries with hashes; formulas neutralised; admin only; size cap                                   | API test + exported file            |
| SEC-81 | Export, verification and viewing                                                           | Each recorded; the export entry exists before data is sent                                                             | API test                            |
| SEC-82 | Verify an untouched log                                                                    | `INTACT` with the entry count; recorded as `SUCCESS`                                                                   | API test + UI screenshot            |
| SEC-83 | Modify one entry (triggers dropped)                                                        | `TAMPERED`, first problem names its `seq`, `HASH_MISMATCH`; recorded as `FAILURE`                                      | API test + UI screenshot            |
| SEC-84 | Delete an entry from the middle                                                            | `TAMPERED` at the following entry, `SEQUENCE_GAP` or `CHAIN_BROKEN`                                                    | API test                            |
| SEC-85 | Delete the last entries                                                                    | Detected through the head anchor (`HEAD_MISMATCH`)                                                                     | API test                            |
| SEC-86 | Modify an entry and recompute all later hashes                                             | Not caught by the chain alone; caught by the anchor; limit documented                                                  | API test + demo output              |
| SEC-87 | Scheduled verification after tampering                                                     | `AUDIT_TAMPER_DETECTED` and one `CRITICAL` alert; no repeat for the same finding                                       | Fake-clock test                     |
| SEC-88 | 5 failures on one account in 5 minutes; 4 failures; fifth after 5 min 01 s                 | One alert; none; none                                                                                                  | Fake-clock test                     |
| SEC-89 | Lock threshold 3, five attempts on one account                                             | Rule 1 still fires (lock refusals count)                                                                               | Integration test                    |
| SEC-90 | 3 failures then a success; 2 then a success; failures older than 10 minutes; two successes | `CRITICAL` alert once; none; none; no second alert                                                                     | Fake-clock test                     |
| SEC-91 | Any alert                                                                                  | `ALERT_RAISED` entry, security event and file line share one alert id                                                  | Integration test                    |
| SEC-92 | Alert file path unwritable, or under a public directory                                    | `FAILED` status, request unaffected; start-up refuses a public path                                                    | Integration test                    |
| SEC-93 | Trigger the same rule twice within 5 minutes                                               | One alert; a new one after the cooldown                                                                                | Fake-clock test                     |
| SEC-94 | Canarytokens webhook (extra): wrong secret, valid payload, replay, oversized body          | `404`; one entry and event, no outbound call; suppressed; rejected                                                     | Integration test                    |
| SEC-95 | Loki shipping (extra): delivery, outage, recovery                                          | Ordered, once, no gaps, requests not delayed                                                                           | Stubbed-endpoint test               |
| SEC-96 | Browser: verify, tamper, verify again                                                      | "Log intact", then "Tampering detected" naming the entry                                                               | E2E screenshot                      |

---

## 10. Recommended implementation order and dependencies

Vertical slices again (schema, service, call sites, UI, tests per slice):

- **Milestone M13 — Foundation:** SD-65, SD-66, SD-67, SD-68. Outcome: a hash-chained, trigger-protected table and one audit service with a fail-closed policy.
- **Milestone M14 — Recording:** SD-69, SD-70, SD-71, SD-72, then SD-73. Outcome: every event of the PDF's list writes an entry.
- **Milestone M15 — Browser and export:** SD-74, SD-75, SD-76. Outcome: the administrator can filter, read and export.
- **Milestone M16 — Integrity:** SD-77, SD-78, SD-81, SD-82, then SD-79, SD-80. Outcome: verification, protection guarantees and a repeatable tamper demonstration.
- **Milestone M17 — Detection:** SD-83, SD-84, SD-85, SD-86, then SD-87. Outcome: both rules alert into the log and the alert file.
- **Milestone M18 — Extras, verification, submission:** SD-88 and/or SD-89, SD-90, SD-91, SD-92.

```
SD-65 ─▶ SD-66 ─┬─▶ SD-68 ─┬─▶ SD-69 ─▶ SD-84, SD-85
SD-67 ──────────┘          ├─▶ SD-70, SD-71, SD-72 ─▶ SD-73
                           └─▶ SD-81
SD-65, SD-67 ─▶ SD-74 ─▶ SD-75 ─▶ SD-76 ─▶ SD-78 ─▶ SD-82
SD-66 ─▶ SD-77 ─▶ SD-78, SD-79 ─▶ SD-80 ◀─ SD-83 ─▶ SD-84, SD-85, SD-86 ─▶ SD-87
SD-66 ─▶ SD-89              SD-68 ─▶ SD-88
all P0 ─▶ SD-90 ─▶ SD-91 ─▶ SD-92
```

---

## 11. UI and user journeys

### 11.1 Page inventory changes

| Route / element          | Change                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `/admin/audit-log` (new) | Filters, table, details drawer, export buttons, integrity panel, detection-rules panel |
| `/admin/security-events` | `DETECTION_ALERT` shown with its rule title, link to the triggering entries            |
| App shell                | The critical banner also covers `CRITICAL` detection alerts                            |
| Navigation               | New entry for users with `audit-log:read`                                              |

### 11.2 Journey: an attacker guesses a password

1. The attacker fails four times, then logs in correctly. The log shows four `AUTH_LOGIN_FAILURE` entries and one `AUTH_LOGIN_SUCCESS` for the same account.
2. Rule 2 fires: a `CRITICAL` `ALERT_RAISED` entry, a `DETECTION_ALERT` event and a line in the alert file; the banner appears for the administrator.
3. The administrator opens the log, filters by the account, follows the alert's link to the five entries, and resets the password and blocks the account; both actions are recorded.

### 11.3 Journey: the administrator verifies the log

The administrator clicks "Verify integrity" and sees "Log intact" with the entry count; the click is recorded. After someone changes an entry in the database file, the same button shows "Tampering detected", the entry's sequence number and the kind of problem.

### 11.4 Journey: the administrator exports evidence

The administrator filters by date range and action, exports CSV, and the export entry already exists in the log with the filters and the row count; the file carries the hashes for offline checking.

---

## 12. Threat model additions

| Threat                        | Risk                                                    | Planned control                                                                            | Test           |
| ----------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------- |
| Log injection                 | Newlines or markup forge entries or lines               | One sanitizer, template descriptions, strict schemas, JSON encoding, interpolation-only UI | SEC-66         |
| Spreadsheet formula injection | A malicious cell runs in a spreadsheet                  | Prefix on export                                                                           | SEC-66, SEC-80 |
| Secrets in the log            | A mistyped password in the login field is stored        | Unknown logins stored only as keyed references; no secret-like keys; strict schemas        | SEC-65         |
| Modified entry                | Evidence is altered                                     | SHA-256 chain, full verification, entry named                                              | SEC-83         |
| Deleted entry                 | Evidence is removed                                     | Sequence gaps and chain break                                                              | SEC-84         |
| Tail truncation               | Latest entries are cut off                              | Head anchor outside the database                                                           | SEC-85         |
| Recomputed chain              | Attacker with database access rewrites all later hashes | Anchor; off-host copy (Loki); documented residual risk                                     | SEC-86         |
| Application-level tampering   | A bug or a malicious admin edits entries                | No edit route, triggers, lint, tests                                                       | SEC-76, SEC-77 |
| Switching auditing off        | Attacker silences the log                               | No switch exists; fail-closed writes                                                       | SEC-73, SEC-77 |
| Unrecorded actions            | A new endpoint forgets to log                           | Coverage guard                                                                             | SEC-69, SEC-70 |
| Log flooding                  | Bot fills the table                                     | IP block samples refusals per bucket; Module 2 limits stop most attempts earlier           | SEC-67         |
| Alert storm                   | Same rule fires constantly                              | Cooldown per rule and subject                                                              | SEC-93         |
| Detection blind spot          | Lock hides repeated failures                            | Rule 1 counts lock refusals                                                                | SEC-89         |
| Alert channel failure         | The alert file cannot be written                        | Alert stays in the log and security events; status `FAILED`                                | SEC-92         |
| Log privacy                   | IP and login are personal data kept forever             | Minimal fields, documented legal basis and retention consequence                           | Review         |
| Webhook abuse (extra)         | Forged or replayed Canarytokens calls                   | Secret path, size limit, dedupe, rate limit, no outbound reply                             | SEC-94         |

Residual risks to state in the report: an attacker who controls the host can drop the triggers and rewrite the database, the anchor and the alert file together; the chain is tamper-evident, not tamper-proof; SQLite is single-process; the in-memory limiters of Modules 1 and 2 are lost on restart.

---

## 13. Definition of Done

A backlog item is done only when: it meets its acceptance criteria; the backend enforces the rule independently of Angular; input is validated server-side with strict schemas; nothing secret or user-controlled is written to the log unsanitized; positive and negative automated tests exist and pass; new routes and permission codes are documented and on the right allowlist; schema changes have migrations that keep existing data; failures are consistent and leak no internals; the feature runs from a fresh clone via the README; and report evidence exists where the PDF requires it.

### 13.1 Definition of Done for the entire Module 3

- Every event the PDF lists is recorded with user, UTC time, IP address, action, description and result, with no passwords, tokens or keys.
- The administrator can browse the log with filters by user, date and event type and export it to a file.
- The log is a hash-chained table (variant 2); the administrator's verification shows "intact" or "tampering detected" naming the entry; changing and deleting an entry were demonstrated.
- Recording cannot be disabled, no route edits or deletes entries, and export, verification and viewing are recorded.
- Rule 1 (5 failures in 5 minutes) and rule 2 (success after ≥ 3 failures) raise alerts into the log and into the alert file.
- At least one extra task is implemented, or consciously dropped and recorded.
- All tests are green with the 80% coverage gate and SEC-63 to SEC-96 traceability.
- The Module 3 report, screenshots, project-wide conclusions and repository link are complete.

---

## 14. Reporting checklist mapped to the PDF

| PDF requirement                          | Deliverable      | Evidence                                                                                                   |
| ---------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Theoretical introduction                 | Report section 1 | Why log, what a good entry is, UTC, no secrets, log injection, integrity, SIEM, own words                  |
| Variant number                           | Report section 2 | Variant No. 2 and its four parts                                                                           |
| Sample log entry                         | Report section 2 | One real row with all fields                                                                               |
| List of recorded events                  | Report section 2 | The catalogue of section 6.2                                                                               |
| Integrity protection and detection rules | Report section 2 | Chain formula, verification, anchor, both rules, alert file                                                |
| Key code                                 | Report section 2 | Append and hash, verification, rule 2, file dispatcher                                                     |
| Screenshots                              | Report section 3 | Log browser with filter, table fragment, verification before and after modification, alerts, exported file |
| Control questions                        | Report section 4 | See hints below                                                                                            |
| Conclusions of the whole project         | Report section 5 | Modules 1 to 3 together, limits, further work                                                              |
| Repository link or archive               | Appendix         | URL                                                                                                        |

### Hints for the control questions

1. **Why not build logging and analysis from scratch.** Parsing, correlation, storage at scale, rule languages and threat content are large, specialised and constantly changing; ready libraries and SIEM systems are reviewed by many, ship detection content, retention and alerting, and meet regulatory expectations (NIS2, GDPR accountability). A home-made one repeats known mistakes (log injection, lost events, no tamper protection) and has no one else maintaining it. Here the audit log is custom only because the assignment asks to build and understand the mechanism.
2. **No passwords in logs, even wrong ones.** A mistyped password is usually a near-copy of the real one or of the user's password elsewhere; logs are copied, shipped, backed up and read by more people and systems than the credential store, kept for a long time, and a leak of the log is a leak of credentials. Users also paste passwords into the login field, which is why the project stores unknown logins only as keyed references.
3. **Log injection.** Data from the user (a login, a header) is written into the log without neutralising control characters, so an attacker can insert line breaks and forge entries that look genuine, hide their own traces or confuse parsers and analysts; markup or formulas can also attack whoever views or exports the log. The fix is sanitising and encoding, fixed templates, structured fields and safe rendering.
4. **How the chain detects change and how to bypass it.** Each entry's SHA-256 covers its content and the previous hash, so changing or deleting one breaks every later link and the verification names the first broken entry. An attacker with database access can bypass it by deleting the tail (the rest is still a valid chain), by recomputing every later hash (SHA-256 is unkeyed), by replacing the whole database, or by dropping the triggers first. The project narrows this with the head anchor, and closes it only with a copy the attacker cannot write (remote shipping), a keyed hash (HMAC) whose key is outside the database, or write-once storage.

---

## 15. Decisions, assumptions and open points

| ID   | Topic                           | Decision                                                                                                                                                                               | Status                                                                                       |
| ---- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| D-01 | Variant                         | Variant No. 2: table in the database, SHA-256 chain in a column, "success after ≥ 3 failures", separate alert file                                                                     | [VARIANT], confirmed by the student                                                          |
| D-02 | Auditor role                    | Not added. Variant 2 of Module 1 has four roles; only the Administrator browses, exports and verifies. Three separate permission codes keep a future read-only Auditor a matrix change | [DESIGN]. The PDF says "if it exists in the variant"                                         |
| D-03 | Window of rule 2                | The ≥ 3 consecutive failures must lie within 10 minutes before the success                                                                                                             | [DESIGN]. The PDF says "right after" without a window; see O-01                              |
| D-04 | Audit log vs security events    | Separate stores. `security_events` stays the mutable alert feed with acknowledgement and purge; `audit_log` is append-only                                                             | [DESIGN]                                                                                     |
| D-05 | Fail-closed writes              | State changes and successful logins fail if the entry cannot be written; refusals do not                                                                                               | [DESIGN]. "Recording cannot be switched off" implies nothing happens unrecorded              |
| D-06 | Retention                       | The application never deletes audit rows; the log only grows, and archival is future work                                                                                              | [DESIGN]. Deleting would contradict the assignment; GDPR consequence is stated in the report |
| D-07 | Typed login of unknown accounts | Stored only as a keyed reference                                                                                                                                                       | [HARDENING]. Users paste passwords into the login field                                      |
| D-08 | Anonymous `401`                 | Not recorded individually                                                                                                                                                              | [DESIGN]. Noise; bots are visible through Module 2 events                                    |
| D-09 | Rule 1 counts lock refusals     | Yes                                                                                                                                                                                    | [DESIGN]. Otherwise a low lock threshold hides the pattern                                   |
| D-10 | Extra credit                    | Webhook receiver and Loki shipping are both P1; one is enough for the extra credit                                                                                                     | [EXTRA]. See O-02                                                                            |
| D-11 | Error text language             | API messages Polish, UI English                                                                                                                                                        | Consistency with the existing code                                                           |

### 15.1 Open points

- **O-01** The length of the "right after" window of rule 2 is not given in the PDF; 10 minutes is a proposal. Confirm with the lecturer or change the constant in `success-after-failures.ts`.
- **O-02** Which extra task to build first: the Canarytokens webhook needs a public tunnel to a local instance, while Loki runs fully locally in Docker and doubles as the off-host copy of the log. Loki is the easier demonstration; the webhook continues Module 2's story.
- **O-03** The format of the payload Canarytokens posts to a webhook must be checked against the current Canarytokens documentation before SD-88 is coded.
- **O-04** Confirm that the lecturer accepts "table in the database" with the triggers: the triggers are protection against application mistakes, and the integrity requirement is met by the chain.
- **O-05** The PDF's list says "denials of access"; this backlog records `403` refusals with a session and object-level denials, and not anonymous `401`. Confirm that is the intended reading.

---

## 16. Recommended final verification sequence

1. Fresh database: `npm run db:migrate && npm run db:seed`; start both apps.
2. Cause each event of the PDF's list (login, logout, wrong passwords, lock, trap login, password changes, user create, block, role change, delete, settings change, a `403`) and confirm one entry each in `/admin/audit-log`, with UTC time and raw IP and no secrets.
3. Filter by user, by date and by action; export CSV and JSON Lines; check the export entry and the hashes with the documented snippet.
4. Click "Verify integrity": intact. Run `npm run audit:tamper-demo`: observe the four scenarios and the verification results; repeat modification by hand with `sqlite3` on a copy and verify again.
5. Make five wrong passwords on one account within five minutes; then three wrong and one correct: see both alerts in the log, in the alert file and in the admin banner.
6. Confirm that nothing in the application can edit or delete an entry, and that export, verification and viewing are recorded.
7. If built: trigger a Canarytoken and see the webhook entry; start Loki and query the shipped entries.
8. Run `npm test` (SEC-63 to SEC-96 traceability, coverage gate) and the E2E suite three times.
9. Fill the report with the project-wide conclusions, export the PDF, verify that no secret appears anywhere and that a clean clone starts from the README.

---

## 17. References

- "Moduł 3 – Monitorowanie i rejestrowanie zdarzeń bezpieczeństwa.pdf" (3 pages): theory, tasks, variants, control questions, report structure.
- OWASP Logging Cheat Sheet; OWASP Top 10 (Security Logging and Alerting Failures).
- NIST SP 800-92, Guide to Computer Security Log Management.
- Wazuh and Grafana Loki documentation (extra task).
- Canarytokens documentation (docs.canarytokens.org), webhook notifications (extra task).
- Repository documents of Modules 1 and 2: `docs/architecture.md`, `docs/threat-model.md`, `docs/testing.md`, `docs/permissions.md`, `docs/canarytokens.md`.
