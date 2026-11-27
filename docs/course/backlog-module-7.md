# SecureDesk — Module 7 Implementation Backlog

**Theme:** Helpdesk product and data protection — comments and attachments, SLAs, real-time updates, search and reports, and a GDPR toolkit
**Application:** SecureDesk — Angular SPA + Next.js API + PostgreSQL + Redis (Module 4), identity (Module 5), detection and response (Module 6)
**Status:** Implementation specification / actionable product backlog, draft of 2026-11-27
**Language:** English (API error messages stay Polish and UI texts stay English, as in the existing code)
**Prerequisite:** Module 4 through SD-108 (PostgreSQL), SD-110 to SD-113 (Redis and event bus), SD-117 (SSRF guard) and SD-135 (mail service, Module 5). SD-190 changes the audit format; if the Merkle builder and standalone verifier of Module 6 (SD-162, SD-165) already exist, SD-190 must update them to dispatch on `format_version`, otherwise those tasks must be built version-aware from the start.

---

## 0. How to use this document

This backlog continues the numbering of Module 6: **SD-168 to SD-194**, epics **33 to 37**, task IDs **Task 33.1 to Task 37.7**. Layout, priorities and sizes are those of `docs/course/backlog-module-4.md` (sections 0 and 1). One GitHub milestone covers the module.

### Requirement provenance

| Tag           | Meaning                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `[STANDARD]`  | Follows a named standard or regulation (GDPR articles, OWASP file upload guidance, RFC 6455 and SSE spec, ASVS V5, V12) |
| `[HARDENING]` | Security measure beyond the existing controls                                                                           |
| `[DESIGN]`    | Project decision to make the feature cohesive, demonstrable and extensible                                              |
| `[PRODUCT]`   | Helpdesk functionality that makes the application a credible product                                                    |
| `[PORTFOLIO]` | Mainly improves how the project demonstrates skills                                                                     |

---

## 1. Goals and scope

### 1.1 Goals

1. Turn the ticket list into a usable helpdesk: conversations, files, priorities, categories, deadlines, notifications, search and reporting.
2. Keep the project's central property — **object-level authorization everywhere** — true for every new surface: comments, attachments, search, streams, notifications, reports.
3. Make the files a first-class attack surface, handled with the discipline of a security product (validation, quarantine, scanning, safe delivery).
4. Provide a credible data-protection story, including the hard problem of erasing personal data from an append-only, hash-chained log.

### 1.2 In scope

Epic 33 Comments and attachments, Epic 34 SLA, priorities and categories, Epic 35 Real-time updates and notifications, Epic 36 Search and reports, Epic 37 GDPR and data-protection toolkit (including envelope encryption and the final project closeout).

### 1.3 Out of scope

- Inbound email-to-ticket, chat or phone channels, a customer portal separate from the app, a knowledge base, multi-tenancy.
- Rich text or markdown rendering of ticket content. Text stays plain (README rule: never rendered as HTML).
- Office-document preview or conversion; thumbnails.
- A full e-discovery or legal-hold system.

### 1.4 What already exists and how Module 7 changes it

| Existing                                                                                            | Change in Module 7                                                                                           |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `tickets` table (`title`, `description`, three statuses, creator, assignee) and `tickets/policy.ts` | SD-174 adds `priority`, `category_id`, status `WAITING`; the policy predicate is reused by every new feature |
| Ticket lifecycle audit events (added in SD-120)                                                     | SD-168 adds the `ticket_activity` feed in the same transactions                                              |
| In-process domain emitter for webhooks (SD-117)                                                     | SD-180 replaces it with a transactional outbox and Redis fan-out; the webhook subscriber moves onto it       |
| Mail service and outbox (SD-135), event bus (SD-113), shared limiter (SD-111)                       | Used by notifications, SLA escalation, reports                                                               |
| `maintenance/purge.ts` with hard-coded retention for security events                                | SD-191 replaces it with a configurable, auditable retention engine                                           |
| TOTP secret encrypted with `TOTP_ENCRYPTION_KEY` (AES-256-GCM, no key rotation)                     | SD-192 introduces envelope encryption with versioned keys and migrates TOTP and webhook secrets              |
| Audit entries store login and IP in plaintext inside the hash chain (`sd-audit-v1`)                 | SD-190 introduces format `sd-audit-v2` with per-subject encrypted personal fields (crypto-shredding)         |
| `docs/testing.md` lists SEC-01 to SEC-188 after Modules 4 to 6                                      | This module adds SEC-189 to SEC-228                                                                          |

---

## 2. Architecture and conventions

### 2.1 One visibility predicate, many consumers

```text
                    tickets/policy.ts  ── visibleTicketsFor(user) (SQL fragment) ── canReadTicket(user, ticket)
                          │
   ┌──────────┬───────────┼────────────┬───────────────┬──────────────┐
   ▼          ▼           ▼            ▼               ▼              ▼
 list     comments   attachments    search        SSE / notifications  reports
 (exists) (SD-168)   (SD-170..173)  (SD-184)      (SD-179..183)        (SD-186, SD-187)
```

Every new surface obtains its rows from the same SQL fragment or the same object check; none implements its own rule. A leak test per surface runs the four ticket-capable roles against the same fixture (Guest, Employee, Manager, and a user of each role who is **not** involved), and the Administrator and Auditor as the "never" cases.

### 2.2 Conventions inherited (unchanged)

An unreadable ticket and a missing ticket are indistinguishable (`404`); strict Zod bodies; plain-text rendering by interpolation only; permission matrix and doc test; audit fail-closed for state changes with ids and codes only (**never ticket or comment text**); injected clock; Polish API messages, English UI.

### 2.3 Conventions added by this module

- **Uploads never touch the final store before scanning.** Stream to quarantine, validate by content, scan, then promote (D7-04).
- **Internal notes are a separate visibility class.** Everything that can reveal a comment (lists, counts, activity, notifications, search, exports, streams) filters on visibility in SQL, not after the fact.
- **Events are transactional.** A domain event is inserted into `domain_event_outbox` in the same transaction as the change; delivery is at-least-once with consumer idempotency by event ID (D7-05).
- **Personal data is classified.** Every column is registered in a data inventory; an unclassified column fails the build (SD-188).
- **Encryption scope is explicit.** Secrets, attachments at rest and audit personal fields are encrypted; ticket and comment text is **not**, because search and the existing policy depend on it (D7-02).

### 2.4 New configuration (`.env.example`)

```bash
# Attachments (SD-170 to SD-173). The store lives outside every served directory.
ATTACHMENT_STORE_PATH=./data/attachments
ATTACHMENT_QUARANTINE_PATH=./data/quarantine
ATTACHMENT_MAX_BYTES=10485760
# ClamAV daemon (SD-172). With ATTACHMENT_SCAN_REQUIRED=true, files stay PENDING when the scanner is down.
CLAMAV_HOST=localhost
CLAMAV_PORT=3310
ATTACHMENT_SCAN_REQUIRED=true
# Real-time (SD-181)
SSE_MAX_CONNECTIONS_PER_USER=5
# Envelope encryption (SD-192). JSON key ring file, mode 0600, outside the data directory.
ENCRYPTION_KEYRING_PATH=
ENCRYPTION_ACTIVE_KEY_ID=
```

### 2.5 Standards covered

GDPR Articles 5 (principles), 15 (access), 17 (erasure), 25 (data protection by design), 30 (records of processing), 32 (security of processing), 35 (DPIA); OWASP ASVS V5 (file handling), V8 (data protection), V12 (communications), V14; OWASP File Upload Cheat Sheet; HTML Living Standard (server-sent events); PostgreSQL full-text search; NIST SP 800-57 (key management) and SP 800-38D (GCM).

---

## 3. Data model additions

| Table                 | Columns (summary)                                                                                                                                                                             | Notes                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `tickets` (altered)   | `priority` (`LOW`, `NORMAL`, `HIGH`, `URGENT`, default `NORMAL`), `category_id`, status `WAITING` added, generated `search_vector tsvector`                                                   | CHECK constraints updated; backfill in the migration                    |
| `ticket_comments`     | `id`, `ticket_id`, `author_user_id`, `visibility` (`PUBLIC`, `INTERNAL`), `body`, `created_at`, `edited_at`, generated `search_vector`; `ticket_comment_revisions` (previous bodies)          | No delete route; edits insert revisions                                 |
| `ticket_activity`     | `id`, `ticket_id`, `kind` (`CREATED`, `STATUS`, `ASSIGNED`, `PRIORITY`, `CATEGORY`, `COMMENT`, `ATTACHMENT`), `actor_user_id`, `from_value`, `to_value`, `internal boolean`, `created_at`     | Written in the change's transaction; values are enums or ids            |
| `ticket_attachments`  | `id`, `ticket_id`, `uploader_user_id`, `store_key` (random), `original_name` (sanitised), `detected_type`, `size_bytes`, `sha256`, `scan_status`, `scan_attempts`, `created_at`, `scanned_at` | `store_key` is never derived from the name                              |
| `categories`          | `id`, `name`, `active`, `sort_order`                                                                                                                                                          | Managed by the Administrator                                            |
| `sla_policies`        | `priority`, `first_response_minutes`, `resolution_minutes`, `calendar_id`                                                                                                                     | One row per priority                                                    |
| `business_calendars`  | `id`, `name`, `timezone`, `weekly jsonb`, `holidays date[]`                                                                                                                                   |                                                                         |
| `ticket_sla`          | `ticket_id`, `first_response_due_at`, `resolution_due_at`, `first_response_at`, `paused_at`, `paused_total_seconds`, `at_risk_notified_at`, `breached_notified_at`                            | Recomputed on priority and status changes                               |
| `domain_event_outbox` | `id` (uuid v7), `type`, `aggregate_id`, `payload jsonb` (ids only), `created_at`, `published_at`                                                                                              | Retained 48 hours after publication                                     |
| `notifications`       | `id`, `user_id`, `type`, `ticket_id`, `event_id`, `created_at`, `read_at`; `notification_preferences` (`user_id`, `type`, `in_app`, `email`)                                                  | Payload is ids and type only                                            |
| `saved_filters`       | `id`, `user_id`, `name`, `definition jsonb`, `created_at`                                                                                                                                     | Owner only                                                              |
| `retention_policies`  | `class`, `days`, `enabled`, `last_run_at`, `last_deleted_count`                                                                                                                               | Seeded with documented defaults                                         |
| `erasure_requests`    | `id`, `subject_user_id`, `requested_by`, `reason_code`, `redact_content`, `status`, `approved_by`, `created_at`, `completed_at`                                                               | Four-eyes optional                                                      |
| `subject_keys`        | `subject_type` (`USER`, `DAY`), `subject_id`, `wrapped_key bytea`, `kek_id`, `created_at`, `destroyed_at`                                                                                     | Destroying the row's key material is the erasure of audit personal data |
| `audit_log` (altered) | `format_version smallint default 1`                                                                                                                                                           | Version 2 stores personal fields as ciphertext envelopes                |

---

## 4. Permission additions

| Code                                 | Meaning                                           | Roles                               |
| ------------------------------------ | ------------------------------------------------- | ----------------------------------- |
| `comments:create`                    | Add a public comment to a readable ticket         | Manager, Employee, Guest            |
| `comments:create:internal`           | Add an internal note                              | Manager, Employee                   |
| `comments:read:internal`             | Read internal notes                               | Manager, Employee                   |
| `attachments:upload`                 | Upload to a readable ticket                       | Manager, Employee, Guest            |
| `attachments:download`               | Download from a readable ticket                   | Manager, Employee, Guest            |
| `tickets:priority:set`               | Change priority                                   | Manager                             |
| `categories:manage`                  | Manage categories                                 | Administrator                       |
| `sla:manage`                         | Manage SLA policies, calendars, escalation rules  | Administrator                       |
| `notifications:read-own`             | Read and manage own notifications and preferences | Every role                          |
| `reports:read`, `reports:export`     | Aggregated metrics and exports                    | Manager                             |
| `privacy:export-own`                 | Download own data                                 | Every role                          |
| `privacy:export-any`                 | Produce a subject export for a user               | Administrator                       |
| `privacy:erase`                      | Request, approve and run an erasure               | Administrator                       |
| `retention:read`, `retention:manage` | View and change retention policies                | Administrator (`read` also Auditor) |

Employees comment and upload only on tickets they may read (created by them or assigned to them). Administrator and Auditor hold **no** ticket-surface permission; their `403` answers extend SEC-15 and SEC-164. Aggregated reports and statistics are Manager-only (and an Employee's own workload card), D7-06.

---

## 5. API contract

### 5.1 New endpoints (summary)

| Method and path                                                                                                | Purpose                                       | Permission                                               |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| `GET/POST /api/tickets/{id}/comments`, `PATCH .../{commentId}`                                                 | Thread, add, edit within the window           | `comments:*`                                             |
| `GET /api/tickets/{id}/activity`                                                                               | Activity feed                                 | Ticket read                                              |
| `POST /api/tickets/{id}/attachments`, `GET .../{attId}`, `DELETE .../{attId}`                                  | Upload, download, remove own or any (Manager) | `attachments:*`                                          |
| `PATCH /api/tickets/{id}` (priority, category)                                                                 | Change priority and category                  | `tickets:priority:set`, creator for category at creation |
| `GET/POST/PATCH /api/admin/categories`, `.../sla-policies`, `.../business-calendars`, `.../sla-escalation`     | Configuration                                 | `categories:manage`, `sla:manage`                        |
| `GET /api/me/notifications`, `PATCH .../{id}`, `POST .../read-all`, `GET/PUT /api/me/notification-preferences` | Notification center                           | `notifications:read-own`                                 |
| `GET /api/stream`                                                                                              | Server-sent events                            | Full session                                             |
| `GET /api/tickets/search`                                                                                      | Full-text search                              | Ticket read                                              |
| `GET/POST/DELETE /api/me/saved-filters[/{id}]`                                                                 | Saved filters                                 | Ticket read                                              |
| `GET /api/reports/summary`, `GET /api/reports/export?format=csv\|pdf`                                          | Metrics and exports                           | `reports:read`, `reports:export`                         |
| `GET /api/me/privacy/export`, `POST /api/me/privacy/erasure-request`                                           | Own data export; request erasure              | `privacy:export-own`                                     |
| `POST /api/admin/privacy/exports`, `GET/POST /api/admin/privacy/erasures[/{id}]`, `POST .../{id}/approve`      | Admin privacy tooling                         | `privacy:export-any`, `privacy:erase`                    |
| `GET/PUT /api/admin/retention`, `POST /api/admin/retention/dry-run`                                            | Retention policies                            | `retention:read` / `retention:manage`                    |

### 5.2 Error codes added (messages Polish)

`ATTACHMENT_REJECTED` (415 or 422, one generic code with a reason enum in the details), `ATTACHMENT_TOO_LARGE` (413), `ATTACHMENT_NOT_READY` (409, still scanning), `ATTACHMENT_QUOTA_EXCEEDED` (409), `COMMENT_EDIT_WINDOW_CLOSED` (409), `SEARCH_QUERY_INVALID` (400), `ERASURE_BLOCKED` (409), `STREAM_LIMIT_REACHED` (429).

---

## 6. Detailed implementation backlog

### Task ID map

| Epic                                | Tasks                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 33 Comments and Attachments         | 33.1 = SD-168, 33.2 = SD-169, 33.3 = SD-170, 33.4 = SD-171, 33.5 = SD-172, 33.6 = SD-173                |
| 34 SLA, Priorities and Categories   | 34.1 = SD-174, 34.2 = SD-175, 34.3 = SD-176, 34.4 = SD-177, 34.5 = SD-178                               |
| 35 Real-time and Notifications      | 35.1 = SD-179, 35.2 = SD-180, 35.3 = SD-181, 35.4 = SD-182, 35.5 = SD-183                               |
| 36 Search and Reports               | 36.1 = SD-184, 36.2 = SD-185, 36.3 = SD-186, 36.4 = SD-187                                              |
| 37 GDPR and Data Protection Toolkit | 37.1 = SD-188, 37.2 = SD-189, 37.3 = SD-190, 37.4 = SD-191, 37.5 = SD-192, 37.6 = SD-193, 37.7 = SD-194 |

---

## EPIC 33 — Comments and attachments

### SD-168 / Task 33.1 — Comments, internal notes and the ticket activity feed (backend)

**Priority:** P0 · **Size:** L · **Labels:** [PRODUCT], [HARDENING], backend, database, security · **Depends on:** SD-107, SD-120

**Objective:** Let people talk about a ticket, keep staff-only notes truly private, and record what happened on a ticket as a readable feed.

**Implementation checklist**

- Migration for `ticket_comments`, `ticket_comment_revisions` and `ticket_activity` (section 3); permissions `comments:create`, `comments:create:internal`, `comments:read:internal` in `codes.ts`, `matrix.ts`, `docs/permissions.md`.
- Routes and strict schemas: body 1 to 4,000 characters, plain text, `visibility` default `PUBLIC`; an `INTERNAL` comment requires `comments:create:internal`; the object check is the same as for reading the ticket (unreadable equals missing, `404`), so a Guest or an uninvolved Employee cannot comment (SEC-189).
- Visibility filtering **in SQL** for the thread, the activity feed, unread counts and any count shown anywhere: a Guest never receives, counts or can infer internal notes (SEC-190).
- Edit: only the author, only within 15 minutes of creation (`COMMENT_EDIT_WINDOW_CLOSED` otherwise); each edit inserts a revision; revisions are readable by staff with `comments:read:internal` only (SEC-192); there is no delete route and no delete privilege.
- `ticket_activity` rows (status, assignment, priority, category, comment, attachment) are written **in the same transaction** as the change and the audit entry; rollback leaves none (SEC-193); internal activity rows are flagged and filtered like internal notes.
- Audit events `TICKET_COMMENT_ADDED` and `TICKET_COMMENT_EDITED` carry comment and ticket IDs and visibility, never text (SEC-166 pattern).
- Rate limit comment creation per user (default 20 per minute) via the shared limiter.

**Acceptance criteria**

- [ ] A Guest, an uninvolved Employee, the Administrator and the Auditor cannot read or write comments on a ticket they may not read: `404` or `403` as for tickets (SEC-189).
- [ ] No endpoint returns, counts or leaks internal notes to a Guest (SEC-190).
- [ ] Edits after 15 minutes are refused; every edit keeps a revision; other users cannot edit (SEC-192).
- [ ] If the audit write fails, the comment and its activity row roll back (SEC-193).
- [ ] Minimum 80% test coverage for this module.

### SD-169 / Task 33.2 — Comments and activity UI

**Priority:** P1 · **Size:** M · **Labels:** [PRODUCT], frontend · **Depends on:** SD-168

**Objective:** A readable conversation on the ticket page.

**Implementation checklist**

- Ticket detail gains a thread (plain text, preserved line breaks via CSS `white-space: pre-wrap`, never HTML), a composer with an "Internal note" toggle visible only to roles with the permission, character counter, and an edit control inside the 15-minute window with a visible "edited" marker and revision viewer for staff.
- Activity feed interleaved with comments in time order; internal items visually distinct and absent for Guests (the API never sends them).
- Optimistic send with server reconciliation; errors keep the draft; keyboard accessible; empty and loading states.
- Component tests for each role view; extend the XSS E2E (SEC-26) to comments.

**Acceptance criteria**

- [ ] Comment text with `<script>` and `<img onerror>` renders as text (SEC-191).
- [ ] A Guest's page never contains internal-note text, counts or empty placeholders for them (DOM assertion).
- [ ] A failed send preserves the draft.
- [ ] Minimum 80% test coverage for this module.

### SD-170 / Task 33.3 — Attachment model, file store abstraction and quotas

**Priority:** P0 · **Size:** M · **Labels:** [HARDENING], [STANDARD], backend, database · **Depends on:** SD-168

**Objective:** Define where files live and how they are named and limited, before any upload code exists.

**Implementation checklist**

- Migration for `ticket_attachments`; permissions `attachments:upload`, `attachments:download` (section 4).
- `server/files/file-store.ts`: `interface FileStore { putStream; getStream; delete; exists }`; `LocalFileStore` writing under `ATTACHMENT_STORE_PATH` with keys `aa/bb/<uuid>` (random UUID v4 → no name or ticket in the path), directory mode `0700`, file mode `0600`, startup refuses a path under any served directory (reuse `security/private-file.ts`); optional `S3FileStore` (MinIO, compose profile `storage`) marked P2.
- Quotas: 5 attachments per ticket, 25 MB per ticket, 200 MB per user (configurable constants with security settings overrides later); exceeding returns `409 ATTACHMENT_QUOTA_EXCEEDED` (SEC-201).
- Name handling: `sanitizeFileName(name)` keeps a Unicode-normalised basename of at most 100 characters, strips path separators, control, bidi and zero-width characters (the same sanitiser family as `audit/sanitize.ts`), forces a safe extension taken from the **detected** type, never from the client; used for display and the `Content-Disposition` filename only.
- Retention link: attachments are removed with their ticket's retention rule (SD-191).

**Acceptance criteria**

- [ ] The store refuses a path inside a served directory and creates directories with mode `0700` (SEC-197).
- [ ] The stored path contains neither the original name nor the ticket id (SEC-197).
- [ ] Quotas are enforced per ticket and per user (SEC-201).
- [ ] Hostile names (`../../etc/passwd`, NUL bytes, bidi override, 300 characters, `CON.txt`) are neutralised (SEC-197).
- [ ] Minimum 80% test coverage for this module.

### SD-171 / Task 33.4 — Upload endpoint: streaming validation by content

**Priority:** P0 · **Size:** L · **Labels:** [HARDENING], [STANDARD], backend, security · **Depends on:** SD-170, SD-111

**Objective:** Accept only what the application means to accept, and stop everything else as early as possible.

**Implementation checklist**

- `POST /api/tickets/{id}/attachments` as `multipart/form-data` handled with a streaming parser (`busboy`), one file per request, field and part limits, `Content-Length` checked before reading and the byte count enforced while streaming (`ATTACHMENT_MAX_BYTES`, default 10 MB); on overrun abort, delete the partial file and return `413` (SEC-196).
- Object authorization first (readable ticket, `attachments:upload`), then rate limit (10 uploads per minute per user).
- Type decision by **content**, never by `Content-Type` or extension: sniff the first bytes with `file-type` and accept an allowlist (PNG, JPEG, GIF, WebP, PDF, plain text without NUL bytes and valid UTF-8); everything else, including SVG, HTML, XML, JavaScript, archives, executables, Office macro formats and polyglots whose declared and detected types differ, returns `422 ATTACHMENT_REJECTED` with a reason enum (SEC-194, SEC-195).
- Stream to `ATTACHMENT_QUARANTINE_PATH`, compute SHA-256 and size on the fly, insert the row as `PENDING` in the same transaction as the activity and audit entries (`ATTACHMENT_UPLOADED`: ids, size, detected type, hash; no name).
- Duplicates (same ticket, same hash) are rejected idempotently.
- CSRF applies (session auth); the endpoint is not available to API keys in v1.

**Acceptance criteria**

- [ ] An executable renamed `.png` with `image/png` is refused; a genuine PNG with a `.exe` name is accepted and stored as `.png` (SEC-194).
- [ ] SVG, HTML, JavaScript, ZIP, ELF and PE files are refused (SEC-195).
- [ ] A 100 MB stream is aborted after the limit, no partial file remains, response `413`, and memory stays flat (SEC-196).
- [ ] A rapid burst beyond the rate limit is throttled (SEC-201).
- [ ] Minimum 80% test coverage for this module.

### SD-172 / Task 33.5 — Malware scanning with ClamAV and the quarantine state machine

**Priority:** P0 · **Size:** L · **Labels:** [HARDENING], backend, devops, security · **Depends on:** SD-171, SD-101

**Objective:** No file becomes downloadable until it has been scanned and found clean.

**Implementation checklist**

- Compose profile `av` with `clamav/clamav` and a health check; `server/files/clamav.ts` speaking the clamd `INSTREAM` protocol over TCP with chunking, size and timeout limits (no shell-out, no `clamscan` binary), `PING` for health.
- Scanner worker: picks `PENDING` rows, streams the quarantined file to clamd, then: `CLEAN` moves the file to the final store (and encrypts it at rest once SD-192 exists) and sets `scanned_at`; `INFECTED` deletes the file, keeps metadata and hash, raises security event `MALWARE_UPLOADED` (HIGH, with ATT&CK technique mapping T1105 Ingress Tool Transfer for context if the pinned dataset contains it) and audit `ATTACHMENT_QUARANTINED`, notifies the uploader generically; scanner errors set `SCAN_ERROR` after five attempts with backoff.
- **Fail closed:** with `ATTACHMENT_SCAN_REQUIRED=true` a scanner outage leaves files `PENDING` and not downloadable; nothing is ever promoted without a clean verdict (SEC-199). Setting it to `false` is refused in production.
- The EICAR test string is assembled **at runtime** in tests (never committed as a file, to avoid false positives on developer machines and CI scanners).
- Health endpoint reports scanner reachability and signature age; metrics for queue depth, scan time, infected count.

**Acceptance criteria**

- [ ] An EICAR upload ends `INFECTED`, the file is gone, a security event and an audit entry exist, and download answers `404` (SEC-198).
- [ ] With ClamAV stopped, uploads remain `PENDING` and cannot be downloaded; after restart they are scanned in order (SEC-199).
- [ ] A clean file moves from quarantine to the store exactly once, even if two workers race (row lock or `FOR UPDATE SKIP LOCKED`).
- [ ] `ATTACHMENT_SCAN_REQUIRED=false` is refused in production.
- [ ] Minimum 80% test coverage for this module.

### SD-173 / Task 33.6 — Safe download and attachment UI

**Priority:** P0 · **Size:** M · **Labels:** [HARDENING], backend, frontend, security · **Depends on:** SD-172

**Objective:** Deliver files so that a stored file can never become an attack on a user's browser, and show their state clearly.

**Implementation checklist**

- `GET /api/tickets/{id}/attachments/{attId}`: object authorization (unreadable ticket equals missing), status must be `CLEAN` (`409 ATTACHMENT_NOT_READY` when `PENDING`, `404` for `INFECTED`), then stream with `Content-Type` from the **detected** type, `Content-Disposition: attachment; filename*=UTF-8''…` (sanitised), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'`, `Cache-Control: private, no-store`, `Cross-Origin-Resource-Policy: same-origin`; no `Range` support; PDFs are never served inline.
- `DELETE`: the uploader within 15 minutes, or a Manager at any time; removes the file and its row (the metadata deletion is audited with the hash).
- Angular: upload control with drag and drop, progress, per-file status badge (`Scanning`, `Ready`, `Blocked`), accessible announcements, error messages from reason enums, download through a plain link (the browser handles `attachment`).
- Antivirus and type rules documented in `docs/attachments.md`, including the allowlist and why SVG is excluded.

**Acceptance criteria**

- [ ] Every download response carries the full header set above; a stored HTML-in-PNG polyglot is served only as a download with the detected type (SEC-200).
- [ ] A user without ticket access gets `404` or `403` exactly as for the ticket itself (SEC-200).
- [ ] `PENDING` and `INFECTED` files cannot be downloaded (SEC-198, SEC-199).
- [ ] The UI shows the scan state and never renders file content inline.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 34 — SLA, priorities and categories

### SD-174 / Task 34.1 — Priority, category and the `WAITING` status

**Priority:** P0 · **Size:** M · **Labels:** [PRODUCT], backend, frontend, database · **Depends on:** SD-168

**Objective:** Classify tickets so they can be prioritised, filtered and measured.

**Implementation checklist**

- Migration: `tickets.priority`, `tickets.category_id`, `categories`, and status `WAITING` (waiting for the requester), with CHECK constraints updated and existing rows backfilled to `NORMAL` and a default category `General`; update `TICKET_STATUSES`, the policy (who may set `WAITING`), `docs/permissions.md`.
- Strict schemas: creation accepts `categoryId` (active categories only) and **never** `priority`; creators always start at `NORMAL`; only `tickets:priority:set` (Manager) may change priority; category change by the Manager; mass-assignment attempts are rejected (SEC-202).
- Admin categories CRUD (`categories:manage`), soft-deactivation (never delete a used category); audit entries with ids.
- List filters by priority and category; ticket list and detail show them; activity and audit entries for changes (`TICKET_PRIORITY_CHANGED`, `TICKET_CATEGORY_CHANGED`, ids and enums only).

**Acceptance criteria**

- [ ] A Guest or Employee sending `priority` on create or update is refused with the strict-schema error (SEC-202).
- [ ] An inactive or unknown category is refused; a used category cannot be deleted, only deactivated.
- [ ] Migration keeps all existing tickets readable under the same rules (existing tests unchanged).
- [ ] Minimum 80% test coverage for this module.

### SD-175 / Task 34.2 — SLA policies and business-hours calculation

**Priority:** P0 · **Size:** L · **Labels:** [PRODUCT], backend, database · **Depends on:** SD-174

**Objective:** Compute due times in working time, across weekends, holidays and daylight-saving changes, correctly.

**Implementation checklist**

- Migration for `sla_policies`, `business_calendars`, `ticket_sla`; permission `sla:manage` (Administrator).
- Pure library `server/sla/business-time.ts` with `addBusinessMinutes(start, minutes, calendar)` and `businessMinutesBetween(a, b, calendar)`, using Luxon (or Temporal when stable in the Node version) for zones; **no hand-written DST arithmetic**. Calendar: IANA timezone, weekly intervals, holiday dates; validation rejects overlapping or reversed intervals.
- Default policies (documented, editable): Urgent 30 minutes first response and 4 hours resolution on a 24x7 calendar; High 2 and 8 business hours; Normal 4 and 24; Low 8 and 72.
- Computation on ticket creation and when priority changes; status `WAITING` pauses the resolution clock (SEC-205); `first_response_at` is set by the first public comment of a staff member or the first status change away from `OPEN`.
- Exhaustive tests with the fake clock: weekend crossing, holidays, start outside hours, Europe/Warsaw spring-forward and fall-back days, zero and very large durations.

**Acceptance criteria**

- [ ] The due time of a ticket created Friday 15:30 with 4 business hours lands Monday after the weekend as documented (SEC-203).
- [ ] Calculations across both DST transitions of `Europe/Warsaw` match the fixture table (SEC-203).
- [ ] `WAITING` pauses the clock and resuming extends the due time by the paused duration (SEC-205).
- [ ] Invalid calendars are refused at save.
- [ ] Minimum 80% test coverage for this module.

### SD-176 / Task 34.3 — SLA timers, at-risk and breach detection

**Priority:** P0 · **Size:** L · **Labels:** [PRODUCT], backend · **Depends on:** SD-175, SD-180

**Objective:** Notice when a ticket is about to miss, and when it has missed, exactly once each.

**Implementation checklist**

- Scheduled worker (same pattern as `audit/scheduled-verification.ts`, interval 1 minute, leader selection through a Postgres advisory lock so multiple instances do not duplicate work): selects tickets with an unresolved clock whose elapsed share crosses 80% (`SLA_AT_RISK`) or 100% (`SLA_BREACHED`) for either target.
- Idempotent: sets `at_risk_notified_at` and `breached_notified_at` with a conditional update so each event is emitted once per ticket and target (SEC-204).
- Emits domain events (`ticket.sla_at_risk`, `ticket.sla_breached`) through the outbox (SD-180) and writes an audit entry `TICKET_SLA_BREACHED` (ids only) for breaches.
- Resolved tickets stop their clocks; `RESOLVED` after breach records the breach permanently for reports.
- Metrics: tickets at risk, breached, compliance ratio; worker lag.

**Acceptance criteria**

- [ ] On the fake clock a ticket emits `at_risk` at 80% and `breached` at 100%, once each, even with the worker restarted or two workers running (SEC-204).
- [ ] A resolved ticket emits nothing further.
- [ ] A paused (`WAITING`) ticket does not breach during the pause (SEC-205).
- [ ] Minimum 80% test coverage for this module.

### SD-177 / Task 34.4 — Escalation rules

**Priority:** P1 · **Size:** M · **Labels:** [PRODUCT], backend, security · **Depends on:** SD-176

**Objective:** React to SLA events with a small, safe, configurable set of actions.

**Implementation checklist**

- Setting `sla_escalation_rules` (strict schema, `sla:manage`): per level (`AT_RISK`, `BREACHED`) a list of actions from a closed set: `NOTIFY_MANAGERS`, `NOTIFY_ASSIGNEE`, `BUMP_PRIORITY` (one level, never above `URGENT`).
- Execution consumes the SLA events from the outbox idempotently by event id; `BUMP_PRIORITY` is a state change with its own audit and activity entries (actor `SYSTEM`) and recomputes SLA targets; each rule fires at most once per ticket and level (SEC-206).
- Notifications use SD-179; recipients are active users who may read the ticket (never blocked or deleted users, never the Administrator or Auditor).
- No reassignment action exists on purpose (documented in `docs/sla.md`): moving work between people stays a human decision.

**Acceptance criteria**

- [ ] A breach notifies managers once and bumps the priority one level once, with `SYSTEM` audit and activity entries (SEC-206).
- [ ] Blocked or deleted users never receive escalations (SEC-206).
- [ ] An unknown action in the setting is refused at save.
- [ ] Minimum 80% test coverage for this module.

### SD-178 / Task 34.5 — SLA UI and administration pages

**Priority:** P1 · **Size:** M · **Labels:** [PRODUCT], [PORTFOLIO], frontend · **Depends on:** SD-175, SD-176, SD-177

**Objective:** Make deadlines visible and configurable.

**Implementation checklist**

- Ticket list and detail: priority and category selectors (by permission), SLA countdown badges (`On track`, `At risk`, `Breached`, `Paused`) computed from server-provided due times and server time offset, never from the client clock alone.
- Admin pages `/admin/categories`, `/admin/sla` (policies, calendars with a weekly grid editor, holidays, escalation rules) with validation mirroring the server and a preview of "due time for a ticket created now".
- Accessibility: badges have text, not colour alone; component tests for each state.

**Acceptance criteria**

- [ ] The badge states render for each fixture and match server values.
- [ ] The preview uses the same library output as the server (shared fixtures).
- [ ] Only users with the permissions see the admin pages; the backend refuses others.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 35 — Real-time updates and notifications

### SD-179 / Task 35.1 — Notification model, centre and preferences

**Priority:** P0 · **Size:** M · **Labels:** [PRODUCT], backend, frontend · **Depends on:** SD-168

**Objective:** An in-app inbox of what needs a person's attention.

**Implementation checklist**

- Migration for `notifications` and `notification_preferences`; permission `notifications:read-own`.
- Types: `TICKET_ASSIGNED`, `TICKET_STATUS_CHANGED`, `COMMENT_ADDED` (public or internal as the recipient may see), `SLA_AT_RISK`, `SLA_BREACHED`, `ATTACHMENT_BLOCKED`, `SECURITY_*` for administrators and auditors (incident, approval pending).
- API: list (cursor pagination), unread count, mark read, mark all read, preferences (per type: in-app, email); a user sees only their own rows (another user's id returns `404`).
- Payload is ids and type only; the UI resolves titles through the normal ticket API, so a revoked access shows nothing (a notification for a ticket the user can no longer read renders as "no longer available").
- Retention classes registered for SD-191 (read 90 days, unread 180).

**Acceptance criteria**

- [ ] A user can read and change only their own notifications and preferences (SEC-208).
- [ ] A notification whose ticket became unreadable reveals nothing about it.
- [ ] Rows contain no ticket text (schema and payload test).
- [ ] Minimum 80% test coverage for this module.

### SD-180 / Task 35.2 — Domain events: transactional outbox and authorized fan-out

**Priority:** P0 · **Size:** L · **Labels:** [DESIGN], [HARDENING], backend, database, security · **Depends on:** SD-179, SD-113

**Objective:** Make events reliable and make recipient selection impossible to get wrong.

**Implementation checklist**

- `domain_event_outbox` written in the same transaction as every ticket, comment, attachment, SLA and incident change; envelope `{ id (uuid v7), type, aggregateId, occurredAt, payload (ids only) }`.
- Relay worker (advisory-lock leader): publishes unpublished rows in id order to the Redis event bus, marks `published_at`, retries; with Redis down, events accumulate and are delivered after recovery, none lost (SEC-213); published rows purged after 48 hours.
- `recipientsFor(event)` in `server/events/recipients.ts`: uses `visibleTicketsFor` / `canReadTicket` and the comment visibility rule to compute the **exact** set of users entitled to know; internal-note events exclude Guests; incident and approval events go to administrators and auditors only.
- **Defence in depth:** each consumer (notifications, SSE, email, webhooks) re-checks `canReadTicket(user, ticket)` immediately before delivery; the double check is tested by revoking access between fan-out and delivery.
- Consumers are idempotent by event id (unique `(consumer, event_id)` ledger); the webhook subscriber of SD-117 moves from the in-process emitter to this outbox.
- Unit test matrix of `recipientsFor` across roles and ticket relationships.

**Acceptance criteria**

- [ ] A redelivered event creates no duplicate notification, mail or webhook (SEC-213).
- [ ] With Redis down during a burst of changes, all events are delivered in order after recovery (SEC-213).
- [ ] Revoking a user's access between fan-out and delivery results in no delivery (SEC-208).
- [ ] `recipientsFor` never includes the Administrator or Auditor for ticket events, nor Guests for internal notes (SEC-190, SEC-208).
- [ ] Minimum 80% test coverage for this module.

### SD-181 / Task 35.3 — Server-sent events endpoint

**Priority:** P0 · **Size:** L · **Labels:** [STANDARD], backend, security · **Depends on:** SD-180

**Objective:** Push events to open browsers without creating a side channel around authorization or session expiry.

**Implementation checklist**

- `GET /api/stream` (Node runtime, `dynamic = 'force-dynamic'`, `ReadableStream`, `text/event-stream`, `Cache-Control: no-store`, `X-Accel-Buffering: no`); requires a full session (anonymous `401`, restricted stages `403`, SEC-207); Caddy `flush_interval -1` documented and added to the reference config.
- Per-connection subscription to the user's channel only; the event body contains `type`, `ticketId`, `eventId` and nothing else; the client fetches details through the normal authorized API.
- Session lifecycle: re-validate the session every 30 seconds (idle and absolute expiry honoured), and subscribe to a Redis `session.revoked` topic published by revocation code paths so block, delete, reset, logout and administrator revoke **close the stream within seconds** (SEC-209).
- Heartbeat comment every 20 seconds; `Last-Event-ID` resume replays missed events from the outbox, **re-filtered through the authorization check at replay time**, in order, once (SEC-210); replay window 48 hours.
- Limits: `SSE_MAX_CONNECTIONS_PER_USER` (default 5, `429 STREAM_LIMIT_REACHED`), a global cap, 6 hours maximum connection age; slow consumer protection (drop the connection when the write buffer exceeds a limit).
- Metrics: open streams, events sent, disconnect reasons; no per-user labels.

**Acceptance criteria**

- [ ] Anonymous and restricted-stage requests are refused; a full session connects (SEC-207).
- [ ] Blocking the user, resetting the password or revoking the session closes the open stream within five seconds (SEC-209).
- [ ] After a reconnect with `Last-Event-ID`, missed authorized events arrive once and in order; events for tickets whose access was removed meanwhile do not (SEC-210).
- [ ] The sixth concurrent connection of one user is refused (SEC-211).
- [ ] Minimum 80% test coverage for this module.

### SD-182 / Task 35.4 — Email notifications

**Priority:** P1 · **Size:** M · **Labels:** [PRODUCT], [HARDENING], backend · **Depends on:** SD-180, SD-135

**Objective:** Reach people who are not in the app, without making mail an information leak.

**Implementation checklist**

- Consumer turning selected notification types into mail through the outbox of SD-135 for users who enabled the `email` channel (opt-in, default off except critical security notices of SD-138); requires a verified email (SD-136).
- Content: ticket number, event type, time, and a link to the ticket; **no title, description, comment text or attachment names** (D7-07). Footer with the preferences link.
- Immediate or daily digest per user preference; digest built in one query respecting `canReadTicket` at send time.
- One-click unsubscribe per type through a signed, single-purpose token link (no login needed, scoped to unsubscribing only, expires in 30 days); `List-Unsubscribe` header.
- Rate limit per user (maximum 30 mails per hour), and a global cap; SMTP outage never affects the originating request (SEC-212).

**Acceptance criteria**

- [ ] A mail contains the link and event type and none of the ticket's text (SEC-212).
- [ ] The unsubscribe token only unsubscribes, expires, and cannot be used for anything else (SEC-212).
- [ ] Users without a verified email receive nothing by mail.
- [ ] Mail failure does not affect the request and retries on the documented schedule (SEC-212).
- [ ] Minimum 80% test coverage for this module.

### SD-183 / Task 35.5 — Angular real-time integration and the leak test

**Priority:** P0 · **Size:** M · **Labels:** [PRODUCT], frontend, testing, security · **Depends on:** SD-181, SD-179

**Objective:** Make the UI live and prove no user sees another user's events.

**Implementation checklist**

- `RealtimeService` wrapping `EventSource` with exponential backoff, `Last-Event-ID` handled by the browser, pause when the tab is hidden (reconnect on focus), cleanup on logout and on `401`.
- Live updates: ticket list and ticket detail refresh the affected row through the normal API on `eventId`; toasts for assigned and breached; unread badge in the shell; accessible `aria-live` announcements.
- Cross-user E2E leak test with three browser contexts (Guest creator, Employee assignee, uninvolved Employee) and an Administrator context: events for the ticket reach exactly the first two; internal notes never reach the Guest; the Administrator receives no ticket events (SEC-208).
- Behaviour on session revocation: stream closes, the app signs the user out cleanly.

**Acceptance criteria**

- [ ] The leak test passes: no event reaches an unauthorized context (SEC-208).
- [ ] A reconnect after a network drop shows missed changes without a manual reload (SEC-210).
- [ ] Logout and revocation close the stream and clear listeners (no leak in the test).
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 36 — Search and reports

### SD-184 / Task 36.1 — Full-text search with row-level authorization

**Priority:** P0 · **Size:** L · **Labels:** [PRODUCT], [HARDENING], backend, database, security · **Depends on:** SD-168, SD-174

**Objective:** Fast, relevant search that cannot reveal a ticket, a comment or even a count the caller may not see.

**Implementation checklist**

- Migration: extension `unaccent`; generated `search_vector` on `tickets` (title weight A, description weight B) and on `ticket_comments` using the `simple` configuration with `unaccent` (mixed Polish and English content, D7-08); GIN indexes.
- `GET /api/tickets/search?q=&limit=&cursor=`: query through `websearch_to_tsquery('simple', unaccent($1))` with the value bound as a parameter, length capped at 200, empty or operator-only queries return `400 SEARCH_QUERY_INVALID`; the result set is `visibleTicketsFor(user)` **intersected in SQL** with matches; comment matches count only for comments the caller may read (`INTERNAL` excluded for Guests) (SEC-214, SEC-215).
- Ranking with `ts_rank_cd`; snippets with `ts_headline` configured with private-use Unicode markers (`U+E000`, `U+E001`) as start and stop selectors; the API returns plain text with markers, and the frontend splits on them and renders `<mark>` elements by Angular templates — **no `innerHTML` anywhere** (SEC-216).
- Total counts only for the visible set; pagination by keyset; statement timeout and `LIMIT` cap protect the database.
- Administrator, Auditor and anonymous callers never reach the endpoint (`403`, `401`).

**Acceptance criteria**

- [ ] Across Guest, Employee (involved and uninvolved), Manager, Administrator and Auditor fixtures the same query returns exactly the visible subset, and counts equal the visible subset (SEC-214).
- [ ] A term that appears only in an internal note neither returns the ticket for a Guest nor changes any Guest-visible count or ranking (SEC-215).
- [ ] Hostile queries (`'; DROP TABLE tickets;--`, 10,000 characters, quotes, `&`, `|`, `!`, `<->`) are handled safely; highlight markers cannot produce markup (SEC-216).
- [ ] Search of an `unaccent` query matches accented text (`zażółć` matches `zazolc`).
- [ ] Minimum 80% test coverage for this module.

### SD-185 / Task 36.2 — Advanced filters and saved views

**Priority:** P1 · **Size:** M · **Labels:** [PRODUCT], backend, frontend · **Depends on:** SD-184, SD-176

**Objective:** Let people build and keep the views they use daily.

**Implementation checklist**

- Filter model (strict schema): status set, priority set, category set, assignee (`me`, `unassigned`, user id the caller may see), created and updated ranges, SLA state (`ON_TRACK`, `AT_RISK`, `BREACHED`, `PAUSED`), text; all combined with the visibility predicate in SQL.
- `saved_filters` CRUD (owner only; other users' ids return `404`; maximum 20 per user; name sanitised; definition validated on save and on load because the schema evolves) (SEC-217).
- URL-serialisable filter state in the Angular list (shareable links that still obey each viewer's authorization), a saved-views dropdown, keyboard-friendly filter bar.
- Index review for the common filter combinations (explain plans recorded in the PR).

**Acceptance criteria**

- [ ] A saved filter can be read, changed and deleted only by its owner (SEC-217).
- [ ] Opening someone else's shared filter link shows only what the viewer may see.
- [ ] An outdated saved definition is migrated or rejected with a clear message, never executed unvalidated.
- [ ] Minimum 80% test coverage for this module.

### SD-186 / Task 36.3 — Metrics dashboard

**Priority:** P1 · **Size:** L · **Labels:** [PRODUCT], [PORTFOLIO], backend, frontend · **Depends on:** SD-176, SD-184

**Objective:** Operational insight for managers, computed in SQL and scoped by role.

**Implementation checklist**

- `GET /api/reports/summary?from=&to=`: tickets opened and resolved per day, by status, priority and category, backlog age buckets, median and 90th-percentile time to first response and to resolution (business time from SD-175), SLA compliance percentage per priority, workload per assignee. Permission `reports:read` (Manager); an Employee receives only their own workload and SLA figures from a separate endpoint; Guest, Administrator and Auditor get `403` (SEC-218).
- Aggregation queries use materialised daily rollups refreshed by a scheduled worker for ranges over 31 days; small ranges query live; all queries have statement timeouts and a maximum range of 366 days.
- Angular dashboard `/reports` with small SVG chart components (no heavy charting dependency, D7-09): bars, lines, stacked bars, a compliance gauge; text alternatives and a data-table toggle for accessibility.
- Rounding and timezone rules documented (reports use the SLA calendar timezone).

**Acceptance criteria**

- [ ] Fixture data yields exactly the expected medians, percentiles and compliance values (hand-computed table) (SEC-218).
- [ ] Employees see only their own figures; other roles are refused (SEC-218).
- [ ] The dashboard renders with keyboard-accessible data tables for each chart.
- [ ] Minimum 80% test coverage for this module.

### SD-187 / Task 36.4 — Reports and exports (CSV and PDF)

**Priority:** P1 · **Size:** M · **Labels:** [PRODUCT], [HARDENING], backend · **Depends on:** SD-186

**Objective:** Produce shareable outputs safely.

**Implementation checklist**

- `GET /api/reports/export?format=csv|pdf` (permission `reports:export`, step-up required): CSV of aggregate tables only (no ticket text) with formula neutralisation reused from the audit export (prefix for cells starting `=`, `+`, `-`, `@`, tab, CR); PDF with `pdfkit` embedding the self-hosted font (Polish diacritics), text drawn as text (no HTML conversion), charts drawn from the same data.
- Size and row caps; the export is **audited before** data is sent (`REPORT_EXPORTED`: ids, format, range, row count) (SEC-219).
- Optional scheduled weekly report mailed to opted-in managers through the mail service (aggregate data only, PDF attached under a size cap).
- Document the PDF generator's attack surface (no external resources, no user HTML) in `docs/reports.md`.

**Acceptance criteria**

- [ ] A category named `=HYPERLINK("http://evil")` appears neutralised in the CSV and as inert text in the PDF (SEC-219).
- [ ] The export entry exists before the response body is sent; exceeding the cap is refused (SEC-219).
- [ ] The weekly mail contains aggregates only.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 37 — GDPR and data-protection toolkit

### SD-188 / Task 37.1 — Personal data inventory and records of processing

**Priority:** P0 · **Size:** M · **Labels:** [STANDARD], docs, testing, security · **Depends on:** SD-168

**Objective:** Know exactly which personal data the system holds and why, and make sure it stays known.

**Implementation checklist**

- `docs/privacy/data-inventory.json`: every table and column with `category` (`IDENTIFIER`, `CONTACT`, `CREDENTIAL`, `CONTENT`, `TECHNICAL`, `NONE`), `purpose`, `lawfulBasis`, `retentionClass`, `encryption` (`none`, `field`, `at-rest`), and whether the column is **exported** and **erased** on a subject request.
- `docs/privacy/records-of-processing.md` (Article 30 style): purposes, categories of data subjects and data, recipients (the optional external services: Turnstile, AbuseIPDB, Canarytokens, Loki, SMTP), international transfers, retention, security measures.
- Test `schema-inventory.test.ts`: reads the Drizzle schema and fails when any column is missing from the inventory or when an inventory entry no longer exists; ties into `npm test`.
- `docs/privacy/dpia.md`: a data protection impact assessment of the audit log, the risk engine (SD-143) and the incident evidence (SD-154), with identified risks and mitigations.

**Acceptance criteria**

- [ ] Adding a column without an inventory entry fails the test suite (SEC-220).
- [ ] Every credential-category column is marked as excluded from exports (SEC-221).
- [ ] The records of processing list every optional external service and its default state.
- [ ] Minimum 80% test coverage for this module.

### SD-189 / Task 37.2 — Subject access export

**Priority:** P0 · **Size:** L · **Labels:** [STANDARD], backend, security · **Depends on:** SD-188

**Objective:** Give a person their data, and only theirs, safely.

**Implementation checklist**

- `GET /api/me/privacy/export` (permission `privacy:export-own`, step-up required, one export per hour per user): JSON bundle of the profile (login, names, email, role, timestamps), authored tickets and comments, attachment **metadata** (and the files themselves as an optional second download), notification and preference rows, session and trusted-device summaries, passkey **names and creation dates** (no credential material), linked identities, API key metadata (no secrets), and the audit entries in which the user is the actor or the subject (personal fields decrypted when the key still exists).
- Administrator-initiated export (`POST /api/admin/privacy/exports`, `privacy:export-any`, step-up, reason code required, audited with the subject reference): same builder, delivered as a download to the administrator, who is told to pass it on out of band.
- Excluded by construction (driven by the inventory flags of SD-188): password hashes, TOTP secrets, recovery code hashes, token digests, API key digests, webhook secrets, other people's content, internal notes **about** the subject that contain other staff's personal data (listed by count only).
- The export is audited before data is sent (`PRIVACY_EXPORT_CREATED`: subject reference, size, section list); ZIP size cap; generated in memory or a private temp file removed immediately after sending.

**Acceptance criteria**

- [ ] The bundle contains only the subject's own data and none of the excluded categories (scanner test over the JSON for secret-shaped keys and for another user's identifiers) (SEC-221).
- [ ] A user cannot export another user's data; the administrator path is audited with a reason (SEC-221).
- [ ] Repeated exports are rate-limited; the export entry exists before the body is sent.
- [ ] Minimum 80% test coverage for this module.

### SD-190 / Task 37.3 — Erasure through pseudonymisation and crypto-shredding of the audit log

**Priority:** P0 · **Size:** XL · **Labels:** [STANDARD], [HARDENING], backend, database, security · **Depends on:** SD-188, SD-192, SD-107

**Objective:** Honour a deletion request without breaking the property that makes the audit log valuable: the hash chain (and Merkle tree) must still verify. The mechanism is to store personal fields as ciphertext under a per-subject key, so that destroying the key erases the data while the chain commits to the ciphertext.

**Implementation checklist**

- **Audit format `sd-audit-v2`:** migration adds `audit_log.format_version` (default 1). For version 2, the personal fields `actor_login`, `subject_login` and `ip` are stored as envelope strings `v2:<keyId>:<nonce>:<ciphertext>:<tag>` (AES-256-GCM, additional authenticated data = `seq` and column name) under the subject's key; the canonical text hashed for `entry_hash` is built from the **stored** strings, so the hash is independent of key availability. The verifier (`audit/verify.ts`, the standalone verifier of SD-165, the Merkle builder) dispatches by `format_version`; chains mixing v1 and v2 entries verify (SEC-223).
- **Subject keys:** `subject_keys` with a random 256-bit key per user created lazily, wrapped by the active key-encryption key (SD-192); entries without an authenticated user (failed login for an unknown account, anonymous refusals) use a **daily key** (`DAY`, `YYYYMMDD`) so that the personal data of unauthenticated traffic can be erased in bulk by retention (SD-191).
- **Reading:** the audit browser, export and detail drawer decrypt when the key exists and show `[erased]` for the field when it was destroyed; exports mark erased fields explicitly; filters by login resolve through `actor_user_id` (not by decrypting).
- **Erasure transaction** (`privacy:erase`, step-up, optional four-eyes by setting `privacy_erasure_four_eyes`): (1) pseudonymise the `users` row (`login` to `deleted-<8 hex>`, names to `Deleted user`, email cleared, password replaced by a random hash, TOTP secret, recovery codes, passkeys, external identities, API keys, webhook subscriptions, notifications, trusted devices and login contexts removed, sessions revoked); (2) tickets keep their records (business record, creator shown as "Deleted user"); with `redact_content = true` the user's own tickets' text, comments and attachments are replaced by a removal notice and files deleted; (3) assigned open tickets are unassigned (status unchanged) and managers are notified; (4) **destroy the subject key** (overwrite `wrapped_key`, set `destroyed_at`); (5) write `PRIVACY_ERASURE_COMPLETED` (keyed subject reference, counts, flags; no personal data).
- Blocked cases: the protected `ADMIN`, and the only active Administrator (`ERASURE_BLOCKED`), the requester erasing themselves without a second approver when four-eyes is on.
- **Legacy v1 entries** cannot be rewritten without breaking the chain. Document the limitation and the options (O7-01): the legitimate-interest basis for security logs, a cut-over after which new entries are v2 only, and an optional archive-and-restart procedure.
- Update `docs/audit-log.md` (format v2, canonical text, erasure semantics), threat model and DPIA.

**Acceptance criteria**

- [ ] After an erasure and key destruction, `npm run audit:verify` and the scheduled job still report `INTACT`, the Merkle proofs still verify, and the previous checkpoint remains consistent (SEC-222, SEC-223).
- [ ] The erased user's login and IP appear as `[erased]` in the browser and the export; nothing in the database, logs or backups of the application reveals them after the key is destroyed (SEC-222, SEC-223).
- [ ] A chain with v1 and v2 entries verifies with the live verifier and the standalone verifier (SEC-223).
- [ ] `ADMIN`, the last active Administrator and a self-approval under four-eyes are refused (SEC-227).
- [ ] Open assigned tickets are unassigned and managers notified; the ticket remains readable under the usual rules (SEC-227).
- [ ] Minimum 80% test coverage for this module.

### SD-191 / Task 37.4 — Retention policy engine

**Priority:** P0 · **Size:** L · **Labels:** [STANDARD], backend, database, security · **Depends on:** SD-188

**Objective:** Replace the hard-coded purge with documented, configurable, auditable retention.

**Implementation checklist**

- Migration for `retention_policies`; permissions `retention:read` (Administrator, Auditor) and `retention:manage` (Administrator); registry in `server/maintenance/retention.ts` with one handler per class and its default: security events 90 days (keeps the current behaviour), login attempts 30 days, sessions (expired or revoked) 30 days, password resets 7 days after expiry, email outbox 7 days, notifications read 90 and unread 180 days, webhook deliveries 30 days, playbook runs 365 days, login contexts 180 days, incidents closed 1,095 days, attachments of tickets resolved more than N months (disabled by default), and **audit IP personal data** through destruction of `DAY` keys older than `audit_ip_retention_days` (default 365).
- **The audit log itself is never deleted** (SEC-78 stays true); only the key destruction renders old unauthenticated-traffic IPs unreadable.
- `POST /api/admin/retention/dry-run` returns counts per class without deleting; the scheduled job runs daily, deletes in bounded batches, and writes one summary audit entry `RETENTION_RUN` (class and counts); changes to a policy are audited with old and new values and require step-up.
- Hard floors prevent foot-guns (for example security events cannot go below 7 days, `ADMIN`-related audit data is out of scope); policies cannot be set to zero except by disabling the class.
- Replace `maintenance/purge.ts` and its tests with the engine, keeping the existing behaviour tests green.

**Acceptance criteria**

- [ ] A dry run lists counts without changing data; the real run deletes only rows beyond the retention (fake clock) and writes one summary entry (SEC-224).
- [ ] `audit_log` rows are never deleted; destroying a daily key makes that day's unauthenticated IPs show `[erased]` while the chain verifies (SEC-224).
- [ ] Policy changes are audited with old and new values and refused below the floors.
- [ ] The previous purge behaviour tests still pass under the engine.
- [ ] Minimum 80% test coverage for this module.

### SD-192 / Task 37.5 — Envelope encryption, key ring and rotation

**Priority:** P0 · **Size:** L · **Labels:** [STANDARD], [HARDENING], backend, security · **Depends on:** SD-107

**Objective:** One reviewed way to encrypt sensitive values, with key versions and rotation, replacing ad-hoc AES use.

**Implementation checklist**

- `server/crypto/envelope.ts`: AES-256-GCM with a random 96-bit nonce; a fresh data key per value (or per file) wrapped by a **key-encryption key** from a key ring; ciphertext format `v1:<kekId>:<wrappedDek>:<nonce>:<ciphertext>:<tag>` (base64url fields); additional authenticated data binds table, column and row id so a ciphertext cannot be moved to another row (SEC-225).
- Key ring: JSON file at `ENCRYPTION_KEYRING_PATH` (mode `0600`, outside the data directory, checked with `private-file.ts`), entries `{ id, key (base64, 32 bytes), createdAt, status: active|retired }`; `ENCRYPTION_ACTIVE_KEY_ID` selects the key for new writes; production refuses a missing, loose-mode or placeholder ring; a pluggable provider interface leaves room for a cloud KMS (documented, not implemented).
- Migrate existing secrets: TOTP secrets (currently `TOTP_ENCRYPTION_KEY` AES-GCM), webhook subscription secrets, and the wrapped subject keys of SD-190; a one-off migration re-encrypts existing TOTP values with a dry-run mode and a verification pass; the old env key is accepted only for reading during the migration window.
- Rotation: `npm run crypto:rotate` adds a new active key and re-wraps all data keys in batches (payloads are untouched), reports progress, is resumable and audited (`CRYPTO_KEY_ROTATED`, key ids only); `crypto:verify` decrypts a sample of every class; a retired key may be removed only when the scan finds no value referencing it.
- Wrong key, tampered ciphertext, moved ciphertext and truncated input all fail closed with a generic error and never log the value.

**Acceptance criteria**

- [ ] After rotation every value decrypts with the new active key, and removing the old key after the scan loses nothing (SEC-225).
- [ ] Moving a ciphertext to another row, altering one byte or using the wrong key fails closed (SEC-225).
- [ ] Existing TOTP users keep working after the migration; production start-up refuses an unsafe key ring.
- [ ] The key ring and plaintext secrets never appear in logs, errors, exports or the database.
- [ ] Minimum 80% test coverage for this module.

### SD-193 / Task 37.6 — Attachment encryption at rest and the privacy UI

**Priority:** P1 · **Size:** L · **Labels:** [HARDENING], [PRODUCT], backend, frontend, security · **Depends on:** SD-192, SD-172, SD-189, SD-190

**Objective:** Encrypt stored files and give people and administrators the screens for their privacy rights.

**Implementation checklist**

- Attachment promotion (SD-172) encrypts the file with a per-file data key through a streaming AES-256-GCM format (chunked, 64 KB records with per-chunk authentication and a final-chunk marker to detect truncation); the data key is wrapped by the key ring and stored in `ticket_attachments`; downloads decrypt while streaming; **scanning always happens on plaintext before encryption** (SEC-226).
- Re-encryption of files that were stored before this task, as a resumable job.
- Angular `/account/privacy`: "Download my data" (step-up), "Request erasure" with an explanation of what is erased, what remains (records the organisation must keep) and the audit-log behaviour; status of the request.
- Angular `/admin/privacy`: erasure request queue with approve and reject (four-eyes banner), run, result summary; subject export with reason; retention policy view and editor with dry-run (SD-191); data inventory viewer generated from the JSON.
- Auditor read-only access to the queue and the retention view.

**Acceptance criteria**

- [ ] A file on disk is not equal to the uploaded bytes and decrypts correctly on download; a truncated or altered stored file fails closed (SEC-226).
- [ ] An infected file is detected before encryption (EICAR test) and never stored (SEC-226).
- [ ] A user can request erasure and sees the status; only an Administrator can approve and run it; the Auditor sees the queue read-only.
- [ ] Minimum 80% test coverage for this module.

### SD-194 / Task 37.7 — Module 7 verification, final documentation and project release

**Priority:** P0 · **Size:** M · **Labels:** [FOUNDATION], [PORTFOLIO], docs, testing · **Depends on:** all P0 tasks of Module 7

**Objective:** Close the programme: everything verified, documented and released as a coherent product.

**Implementation checklist**

- Add SEC-189 to SEC-228 to `docs/testing.md` and `docs/asvs.json`; extend the threat model with section 8's table; update `docs/architecture.md`, `docs/permissions.md`, `docs/database-schema.md`.
- Full-product E2E journey: a Guest files a ticket with an attachment (scanned), a Manager sets priority and sees the SLA clock, an Employee comments (public and internal) and the Guest sees only the public one live, search finds the ticket for the right people, the Manager exports the weekly report, the Guest requests erasure, the Administrator approves and runs it, and audit verification still reports intact.
- Final README rewrite (features by area, the security controls table generated from `docs/testing.md`, architecture diagrams, the demo recording refreshed with the new journeys), `docs/case-study-privacy-vs-audit.md` (how erasure and an append-only chain coexist), and a roadmap section.
- Tag `v2.0.0` and let the release pipeline (SD-103) produce signed images, SBOM and provenance.

**Acceptance criteria**

- [ ] The full-product E2E passes three consecutive runs on CI; ZAP baseline, CodeQL, gitleaks and Trivy are green.
- [ ] SEC-01 to SEC-228 map to real test titles; the ASVS and traceability checks are green.
- [ ] `v2.0.0` release exists with signed artifacts; the README quick start works from a clean clone in under 10 minutes.
- [ ] Minimum 80% test coverage for this module.

---

## 7. Security acceptance test matrix

| ID      | Scenario                                                                                     | Expected outcome                                                                            | Evidence             |
| ------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------- |
| SEC-189 | Comment on an unreadable and on a missing ticket; Administrator and Auditor                  | `404` identical; `403` for Administrator and Auditor                                        | API test             |
| SEC-190 | Guest reads thread, activity, counts, notifications, search for a ticket with internal notes | No internal note, count or hint anywhere                                                    | Integration test     |
| SEC-191 | Comment containing `<script>` and `<img onerror>`; 4,001 characters                          | Rendered as text; refused over the limit                                                    | Component + E2E test |
| SEC-192 | Edit at 14:59 and 15:01; edit by another user; revision visibility                           | Allowed then refused; refused; revisions staff-only                                         | Fake-clock test      |
| SEC-193 | Comment or status change with a failing audit write                                          | Change, activity row and entry all roll back                                                | Fault-injection test |
| SEC-194 | Executable renamed `.png` with `image/png`; genuine PNG named `.exe`                         | Refused; accepted and stored as PNG                                                         | API test             |
| SEC-195 | SVG, HTML, JavaScript, ZIP, ELF, PE, polyglot                                                | `422 ATTACHMENT_REJECTED` with reason                                                       | API test             |
| SEC-196 | 100 MB stream; `Content-Length` lie                                                          | Aborted at the limit, no partial file, `413`, flat memory                                   | Integration test     |
| SEC-197 | Hostile file names; store path under a served directory; quarantine path                     | Neutralised names; random keys; start-up refuses unsafe path; modes `0700` and `0600`       | Unit + integration   |
| SEC-198 | EICAR upload                                                                                 | `INFECTED`, file deleted, event and audit entry, download `404`                             | Integration test     |
| SEC-199 | ClamAV stopped, then restarted                                                               | Files stay `PENDING` and undownloadable; scanned in order afterwards                        | Fault-injection test |
| SEC-200 | Download headers; polyglot file; user without ticket access                                  | Full header set, served as attachment; `404` or `403`                                       | API test             |
| SEC-201 | Sixth attachment, per-ticket and per-user quota; upload burst                                | `409 ATTACHMENT_QUOTA_EXCEEDED`; throttled                                                  | API test             |
| SEC-202 | `priority` sent by Guest or Employee; inactive category; mass assignment                     | Refused by strict schema; only Manager sets priority                                        | API test             |
| SEC-203 | Business-time due dates across weekend, holiday, both DST changes                            | Equal to the fixture table                                                                  | Unit test            |
| SEC-204 | Clock crossing 80% and 100%; restart; two workers                                            | One `at_risk` and one `breached` per ticket and target                                      | Fake-clock test      |
| SEC-205 | Ticket set to `WAITING` and resumed                                                          | Clock paused; due time extended by the pause                                                | Fake-clock test      |
| SEC-206 | Escalation on breach; blocked and deleted users; unknown action in setting                   | One bump and one notice, `SYSTEM` audit; no delivery to blocked; setting refused            | Integration test     |
| SEC-207 | `/api/stream` anonymous, restricted stage, full session                                      | `401`, `403`, connected                                                                     | API test             |
| SEC-208 | Three-user, two-role leak test for events and notifications; access revoked mid-delivery     | Events only to entitled users; no delivery after revocation                                 | E2E + integration    |
| SEC-209 | Block user, reset password, administrator revoke, idle timeout during an open stream         | Stream closed within five seconds                                                           | Integration test     |
| SEC-210 | Reconnect with `Last-Event-ID`                                                               | Missed authorised events once, in order; none for revoked access                            | Integration test     |
| SEC-211 | Sixth concurrent connection; slow consumer                                                   | `429 STREAM_LIMIT_REACHED`; slow connection dropped                                         | Integration test     |
| SEC-212 | Notification mail content; unsubscribe token; SMTP outage                                    | Link and event type only; scoped, expiring token; request unaffected                        | Integration test     |
| SEC-213 | Redelivered event; Redis down during a burst of changes                                      | No duplicate effects; all events delivered in order after recovery                          | Fault-injection test |
| SEC-214 | Same query for Guest, involved and uninvolved Employee, Manager, Administrator, Auditor      | Exactly the visible subset and counts; `403` for the last two                               | API test             |
| SEC-215 | Term only in an internal note, queried by a Guest                                            | No result, no count or ranking change                                                       | API test             |
| SEC-216 | Hostile queries; highlight markers                                                           | Safe handling; no markup; accented matching works                                           | API + component test |
| SEC-217 | Saved filters across two users; outdated definition                                          | Owner only; migrated or rejected                                                            | API test             |
| SEC-218 | Summary figures on a fixture; Employee, Guest, Administrator, Auditor                        | Exact values; own figures only; `403` for others                                            | API test             |
| SEC-219 | Report with a formula-like category name; export audit order; caps                           | Neutralised in CSV and inert in PDF; entry before body; cap refused                         | API test             |
| SEC-220 | Add a column without an inventory entry                                                      | Test suite fails                                                                            | Unit test            |
| SEC-221 | Subject export for self and for another user; secret-shaped keys; rate limit                 | Own data only; no excluded categories; admin path audited with reason                       | API test             |
| SEC-222 | Erase a user, destroy the key; verify the chain and Merkle proofs                            | `INTACT`, proofs verify, checkpoints consistent; personal data unrecoverable                | Integration + demo   |
| SEC-223 | Audit browser and export after erasure; mixed v1 and v2 chain; standalone verifier           | `[erased]` shown; hashes unchanged; chain verifies everywhere                               | Integration + CLI    |
| SEC-224 | Retention dry run and real run; `audit_log`; day-key destruction                             | Counts without deletion; only expired rows removed; no audit row deleted; one summary entry | Fake-clock test      |
| SEC-225 | Key rotation; wrong key; moved or altered ciphertext; unsafe key ring                        | Everything decrypts after rotation; failures closed; production start-up refuses            | Unit + integration   |
| SEC-226 | Stored file bytes; truncated or altered file; EICAR before encryption                        | Not equal to plaintext; failures closed; infected never stored                              | Integration test     |
| SEC-227 | Erase `ADMIN`, last administrator, self under four-eyes; open assigned tickets               | Refused; refused; refused; tickets unassigned and managers notified                         | Integration test     |
| SEC-228 | Browser: full-product journey from attachment to erasure and audit verification              | Passes three times                                                                          | E2E                  |

---

## 8. Threat model additions

| Threat                              | Risk                                                          | Planned control                                                                                     | Test                   |
| ----------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------- |
| Insecure direct object reference    | Comments, files, search or streams expose another user's data | One visibility predicate and object check for every surface; `404` for unreadable                   | SEC-189, 200, 208, 214 |
| Internal note disclosure            | A Guest learns staff discussion                               | Separate visibility class filtered in SQL, counts included, events filtered at fan-out and delivery | SEC-190, 215           |
| Stored XSS through content          | Comment, name or snippet executes                             | Interpolation-only rendering, sanitised names, private-use highlight markers                        | SEC-191, 216           |
| Malicious file upload               | Executable, polyglot or script is stored and served           | Content sniffing allowlist, quarantine, scanning, attachment-only delivery with sandbox CSP         | SEC-194 to 200         |
| Resource exhaustion                 | Huge uploads, streams, searches or exports                    | Streaming limits, quotas, rate limits, connection caps, statement timeouts, size caps               | SEC-196, 201, 211      |
| Scanner bypass                      | A file is released without a verdict                          | Fail-closed `PENDING`, promotion only on `CLEAN`                                                    | SEC-199                |
| Priority and category tampering     | A user raises their own priority                              | Strict schemas, Manager-only priority                                                               | SEC-202                |
| SLA clock manipulation              | Clients or status games dodge deadlines                       | Server-side business-time calculation, audited pauses, immutable breach record                      | SEC-203 to 205         |
| Event leakage through side channels | Notifications, mail or SSE reveal ticket text or existence    | Ids-only payloads, mail without content, re-check before delivery                                   | SEC-208, 212           |
| Stale access on open streams        | A blocked user keeps receiving events                         | Revocation topic and periodic re-validation close streams in seconds                                | SEC-209                |
| Lost or duplicated events           | Missed breach notice or double escalation                     | Transactional outbox, idempotent consumers, ordered replay                                          | SEC-213                |
| Search injection and oracle         | Operators or counts reveal hidden data                        | Parameterised `websearch_to_tsquery`, visibility intersected in SQL, visible-only counts            | SEC-214 to 216         |
| Spreadsheet and PDF injection       | Exports execute formulas or markup                            | Neutralisation, text-only PDF drawing                                                               | SEC-219                |
| Over-collection of personal data    | Data kept without purpose                                     | Inventory enforced by test, retention engine, daily-key shredding                                   | SEC-220, 224           |
| Subject export abuse                | Export used to harvest data or secrets                        | Own data only, exclusion by inventory flags, step-up, rate limit, audit before send                 | SEC-221                |
| Erasure versus integrity            | Erasure breaks the audit chain, or the log keeps PII forever  | v2 ciphertext fields, crypto-shredding, chain commits to ciphertext                                 | SEC-222, 223           |
| Key compromise or loss              | Secrets decrypted or data unrecoverable                       | Key ring outside the data directory, versioned keys, rotation, verification scan                    | SEC-225                |
| Insider erasure abuse               | An administrator erases evidence about themselves             | Four-eyes setting, step-up, protected accounts, audited request and result                          | SEC-227                |

Residual risks to state: v1 audit entries written before the cut-over still contain plaintext personal data (documented lawful basis and the archive option); ClamAV detects known malware only; SSE adds long-lived connections to the capacity plan; encrypted fields exclude ticket and comment text by design; a compromised application process can still read decrypted data while running.

---

## 9. Recommended implementation order and dependencies

- **Phase A:** SD-168, SD-169. Outcome: conversations.
- **Phase B:** SD-170, SD-171, SD-172, SD-173. Outcome: safe attachments.
- **Phase C:** SD-174, SD-175, SD-179, SD-180, SD-176, SD-177, SD-178. Outcome: classification, SLAs, reliable events and notification centre.
- **Phase D:** SD-181, SD-183, SD-182. Outcome: real-time and email.
- **Phase E:** SD-184, SD-185, SD-186, SD-187. Outcome: search and reports.
- **Phase F:** SD-192, SD-188, SD-189, SD-190, SD-191, SD-193. Outcome: data protection (SD-192 first, SD-190 needs it).
- **Phase G:** SD-194.

```text
SD-107, SD-120 ─▶ SD-168 ─▶ SD-169
SD-168 ─▶ SD-170 ─▶ SD-171 ─▶ SD-172 ─▶ SD-173 ─▶ SD-193
SD-168 ─▶ SD-174 ─▶ SD-175 ─▶ SD-176 ─▶ SD-177 ─▶ SD-178
SD-168 ─▶ SD-179 ─▶ SD-180 ─▶ SD-176, SD-181 ─▶ SD-183 ;  SD-180, SD-135 ─▶ SD-182
SD-168, SD-174 ─▶ SD-184 ─▶ SD-185 ;  SD-176, SD-184 ─▶ SD-186 ─▶ SD-187
SD-107 ─▶ SD-192 ─▶ SD-190, SD-193 ;  SD-168 ─▶ SD-188 ─▶ SD-189, SD-190, SD-191
all P0 ─▶ SD-194
```

---

## 10. UI and user journeys

| Route / element                   | Change                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `/tickets/:id`                    | Thread, internal notes, activity feed, attachments with scan state, priority, category, SLA badge |
| `/tickets`                        | Search box, filter bar, saved views, priority and SLA columns, live updates                       |
| `/reports`                        | Manager dashboard and exports                                                                     |
| `/account/privacy`                | Export my data, request erasure                                                                   |
| `/admin/categories`, `/admin/sla` | Configuration pages                                                                               |
| `/admin/privacy`                  | Erasure queue, subject export, retention policies, data inventory                                 |
| App shell                         | Notification bell, toasts, live stream status                                                     |

Journeys: (1) a Guest files a ticket with a screenshot; the file shows "Scanning", then "Ready"; (2) an Employee adds an internal note and a public reply; the Guest sees only the reply, live; (3) a ticket nears its deadline, managers are notified, priority is bumped after a breach; (4) a Manager searches "printer floor 2" and exports the weekly report; (5) a user requests erasure, an administrator approves, and the audit log still verifies with the person's identifiers shown as erased.

---

## 11. Definition of Done

As in `docs/course/backlog-module-4.md` section 10, plus: every new surface passes a role-matrix leak test against the shared visibility predicate; no ticket, comment or file content appears in audit entries, notifications, mail, logs, metrics or Redis; files are never served inline and never promoted without a clean verdict; every new column is in the data inventory.

### 11.1 Definition of Done for the entire Module 7

- Comments, internal notes, attachments, priorities, categories, SLAs, notifications, real-time updates, search and reports work end to end under the existing authorization model.
- Files are validated by content, scanned, encrypted at rest and delivered safely.
- Events are reliable (outbox) and recipient selection is provably authorized.
- The data-protection toolkit provides inventory, subject export, erasure with crypto-shredding that keeps the audit chain verifiable, configurable retention and key rotation.
- SEC-189 to SEC-228 are covered; the whole programme (SEC-01 to SEC-228) is traceable; `v2.0.0` is released with signed artifacts.

---

## 12. Decisions, assumptions and open points

| ID    | Topic                      | Decision                                                                                                      | Status      |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------- |
| D7-01 | Roles on ticket surfaces   | Administrator and Auditor have no comment, attachment, search or stream access                                | [DESIGN]    |
| D7-02 | Encryption scope           | Secrets, attachments and audit personal fields are encrypted; ticket and comment text is not (search, policy) | [DESIGN]    |
| D7-03 | Erasure mechanism          | Per-subject keys with crypto-shredding for audit personal data; pseudonymisation for the user row             | [DESIGN]    |
| D7-04 | Upload pipeline            | Quarantine, content sniffing, ClamAV, promotion only on `CLEAN`; SVG and archives refused                     | [HARDENING] |
| D7-05 | Event delivery             | Transactional outbox, at-least-once, idempotent consumers                                                     | [DESIGN]    |
| D7-06 | Reports audience           | Manager aggregates; Employee own workload; no reports for Guest, Administrator, Auditor                       | [DESIGN]    |
| D7-07 | Mail content               | Link and event type only; no ticket text                                                                      | [HARDENING] |
| D7-08 | Search configuration       | `simple` text search config with `unaccent` (mixed Polish and English)                                        | [DESIGN]    |
| D7-09 | Charts                     | In-house SVG components rather than a charting dependency                                                     | [DESIGN]    |
| D7-10 | Priority setting           | Manager only; creators start at `NORMAL`                                                                      | [DESIGN]    |
| D7-11 | No reassignment escalation | Escalation notifies and bumps priority; people reassign                                                       | [DESIGN]    |
| D7-12 | New permissions            | As listed in section 4                                                                                        | [DESIGN]    |

### 12.1 Open points

- **O7-01** Treatment of legacy `sd-audit-v1` personal data: keep under a documented lawful basis, or archive the v1 log offline (encrypted, with its own retention) and start a v2 chain whose first entry commits to the archive's final hash.
- **O7-02** Whether to add Office document types (OOXML) to the upload allowlist with macro-format rejection, or keep the minimal list.
- **O7-03** Whether a hosted S3-compatible store (MinIO profile) is worth finishing or the local file store is enough for the portfolio scope.
- **O7-04** Whether the daily-key scheme for unauthenticated IPs should use UTC days (proposed) or a coarser weekly key to lower key-management overhead.
- **O7-05** Language choices for the full-text search configuration if the user base grows beyond Polish and English.

---

## 13. Recommended final verification sequence

1. `docker compose --profile av --profile mail up --build`; seed.
2. As `guest1`, file a ticket with a PNG; watch `Scanning` become `Ready`; upload an EICAR string (assembled by the test script) and see the block.
3. As `employee1` (assignee), add an internal note and a public reply; confirm the Guest sees only the reply, live, in a second browser.
4. As `manager1`, set priority to Urgent; stop time with the fake clock script (or shorten the SLA) and observe the at-risk and breach notices, the bump, the notification bell and the mail in Mailpit.
5. Search for words from a public comment and an internal note as the Guest and the Manager.
6. Export the weekly report (CSV and PDF) and open the CSV in a spreadsheet with a formula-like category present.
7. As `guest1`, download your data; request erasure; as an administrator approve and run it; open the audit log (identifiers show as erased) and press **Verify integrity**; run the standalone verifier on a fresh export.
8. Run `npm run crypto:rotate`, then `npm run crypto:verify`; run the retention dry run and the real run.
9. Run `npm test`, the E2E suite three times, ZAP, CodeQL, gitleaks and Trivy; tag `v2.0.0`.

---

## 14. References

- GDPR (Regulation (EU) 2016/679), Articles 5, 15, 17, 25, 30, 32 and 35; EDPB guidelines on pseudonymisation and on the right to erasure.
- OWASP File Upload Cheat Sheet; OWASP ASVS V5, V8, V12; ClamAV `clamd` protocol documentation.
- HTML Living Standard, server-sent events; PostgreSQL documentation: full-text search, `unaccent`, advisory locks; Luxon documentation for time zones and DST.
- NIST SP 800-57 (key management), SP 800-38D (GCM); RFC 6962 for the Merkle tree used by the audit log; AWS and Google envelope-encryption design notes.
