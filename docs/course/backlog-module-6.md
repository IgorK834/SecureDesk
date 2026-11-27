# SecureDesk — Module 6 Implementation Backlog

**Theme:** Detection and response — threat intelligence, MITRE ATT&CK mapping, incident cases, automated response playbooks and a witnessed Merkle audit log
**Application:** SecureDesk — Angular SPA + Next.js API + PostgreSQL + Redis (Module 4), identity features of Module 5
**Status:** Implementation specification / actionable product backlog, draft of 2026-11-27
**Language:** English (API error messages stay Polish and UI texts stay English, as in the existing code)
**Prerequisite:** Module 4 through SD-108 (PostgreSQL), SD-111 (shared limiter), SD-113 (event bus). SD-140 (GeoIP, Module 5) is used by enrichment; SD-135 (mail) by playbook notifications.

---

## 0. How to use this document

This backlog continues the numbering of Module 5: **SD-146 to SD-167**, epics **29 to 32**, task IDs **Task 29.1 to Task 32.6**. Layout, priorities and sizes are those of `docs/course/backlog-module-4.md` (sections 0 and 1). One GitHub milestone covers the module.

### Requirement provenance

| Tag           | Meaning                                                                                |
| ------------- | -------------------------------------------------------------------------------------- |
| `[STANDARD]`  | Follows a named standard (MITRE ATT&CK, RFC 6962, RFC 3161, RFC 8032, C2SP tlog specs) |
| `[HARDENING]` | Security measure beyond the existing controls                                          |
| `[DESIGN]`    | Project decision to make the feature cohesive, demonstrable and extensible             |
| `[PORTFOLIO]` | Mainly improves how the project demonstrates skills                                    |

---

## 1. Goals and scope

### 1.1 Goals

1. Turn the alert feed of Modules 2 and 3 into a small SIEM and SOAR: enrich, classify, investigate, respond.
2. Speak the vocabulary of defenders: every rule and event type maps to ATT&CK techniques, and coverage is visible.
3. Handle incidents as cases with ownership, timeline, evidence and measurable response times.
4. Automate containment safely: playbooks with dry-run, approval, guard rails and a kill switch.
5. Close the documented weakness of the audit log (an attacker who controls the host can rewrite chain, anchor and alerts together) with Merkle proofs, signed checkpoints and an independent witness.

### 1.2 In scope

Epic 29 Threat intelligence and ATT&CK, Epic 30 Incident case management (with the read-only Auditor role), Epic 31 SOAR-lite playbooks, Epic 32 Merkle audit log with an off-host witness.

### 1.3 Out of scope

- A general rules language (Sigma import). Rules stay TypeScript modules under `server/detection/rules/`; playbooks are data (D6-02).
- External ticketing or chat integrations beyond the existing webhook and mail.
- Machine-learning anomaly detection.
- Hosted threat-intelligence platforms (MISP, OpenCTI). Feeds are public text lists, plus optional AbuseIPDB.

### 1.4 What already exists and how Module 6 changes it

| Existing                                                                                                                      | Change in Module 6                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `security_events` (aggregated, acknowledged, purged), `security/events.ts`, `security/event-admin.ts`                         | SD-146 adds an `enrichment` column and `attack` tags; SD-150 links events to incidents                |
| Detection engine `detection/engine.ts` with `failed-login-burst` and `success-after-failures` rules                           | SD-148 requires an ATT&CK tag per rule; SD-158 consumes alerts to run playbooks                       |
| Alert channels: file (`alerts/file-alert-dispatcher.ts`), webhook (`security/webhook-alerts.ts`), Loki (`audit/ship-loki.ts`) | SD-157 reuses them as playbook actions; SD-164 adds witness publishers                                |
| IP blocks (`security/ip-block-service.ts`), account locks (login guard), session revocation                                   | SD-157 exposes them as guarded playbook actions                                                       |
| Audit chain (`sd-audit-v1`), head anchor file, scheduled verification, tamper demo                                            | SD-162 to SD-166 add the Merkle tree, signed checkpoints, witness, standalone verifier                |
| Roles: Administrator, Manager, Employee, Guest                                                                                | SD-151 adds the read-only Auditor (the three `audit-log:*` codes were designed for it, Module 3 D-02) |
| `docs/testing.md` lists SEC-01 to SEC-153 after Modules 4 and 5                                                               | This module adds SEC-154 to SEC-188                                                                   |

---

## 2. Architecture and conventions

### 2.1 Detect, enrich, investigate, respond

```text
 request ─▶ defences ─▶ security_events / audit_log
                              │
                              ▼
                  detection engine (rules, ATT&CK tags)
                              │ alert (DETECTION_ALERT)
              ┌───────────────┼──────────────────┐
              ▼               ▼                  ▼
        enrichment      incident auto-open   playbook runner ──▶ actions (guarded)
   (geo, reputation)         │                   │  dry-run / approval / auto
              └──────────────┴──────▶ incident case ◀── notes, timeline, evidence bundle

 audit_log ─▶ Merkle tree ─▶ signed checkpoints ─▶ witnesses (HTTP, RFC 3161, file, git)
                                   └─▶ standalone verifier (files + public keys only)
```

### 2.2 Conventions inherited (unchanged)

Strict Zod bodies and DTOs with the recursive secret-key guard; `defineRoute`; permission matrix and doc test; audit fail-closed policy for state changes; sanitised free text (`sanitizeForLog`); injected clock; generic envelopes; Polish API messages, English UI.

### 2.3 Conventions added by this module

- **Playbooks are data, not code.** A strict schema with whitelisted fields, operators and actions; there is no scripting, templating or expression evaluation.
- **Account-affecting actions need approval.** Automatic mode may only contain addresses, notify and record; any action that changes a user's access runs only after human approval (D6-03). The schema rejects the combination, not only the runtime.
- **Durable by cursor.** Consumers of security events (enrichment retries, incidents, playbooks) keep a persisted cursor and re-read from the database; the event bus is only a latency nudge (D6-04).
- **Keys never live in the database.** Signing keys are files outside the data directory with mode `0600`, checked at start-up.
- **Auditor is read-only by construction.** A conformance test enumerates all routes and fails if the Auditor role holds a mutating permission.

### 2.4 New configuration (`.env.example`)

```bash
# Threat intelligence (SD-147). Feeds are off by default; tests never touch the network.
INTEL_FEEDS_ENABLED=false
INTEL_FEED_MAX_BYTES=5242880
# Optional (SD-147): AbuseIPDB, off when empty. Daily budget keeps within the free tier.
ABUSEIPDB_API_KEY=
ABUSEIPDB_DAILY_BUDGET=800
# Incident evidence signing (SD-154). Ed25519 private key file, mode 0600, outside the data directory.
INCIDENT_SIGNING_KEY_PATH=
# SOAR guard rails (SD-157, SD-158)
SOAR_NEVER_BLOCK_CIDRS=
SOAR_MAX_ACTIONS_PER_HOUR=30
# Audit checkpoints and witnesses (SD-163, SD-164)
AUDIT_SIGNING_KEY_PATH=
AUDIT_CHECKPOINT_EVERY_ENTRIES=100
AUDIT_CHECKPOINT_EVERY_MINUTES=15
AUDIT_PUBLISH_FILE_PATH=
AUDIT_WITNESS_URL=
AUDIT_WITNESS_PUBLIC_KEY=
AUDIT_TSA_URL=
```

### 2.5 Standards covered

MITRE ATT&CK Enterprise (pinned version, see SD-148); NIST SP 800-61 rev. 3 (incident response), NIST SP 800-92; RFC 6962 (Merkle tree hashing, inclusion and consistency proofs), C2SP signed-note and tlog-checkpoint, RFC 8032 (Ed25519), RFC 3161 (time-stamp protocol); OWASP ASVS V7 (logging), OWASP Top 10 A09; ISO/IEC 27035.

---

## 3. Data model additions

| Table                       | Columns (summary)                                                                                                                                                                                 | Notes                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `security_events` (altered) | `enrichment jsonb`, `attack_techniques text[]`                                                                                                                                                    | Not added to `audit_log`                                      |
| `ip_reputation_lists`       | `id`, `name`, `source_url`, `enabled`, `last_fetched_at`, `entries_count`, `status`, `last_error_class`                                                                                           | Seeded with documented public lists, all disabled             |
| `ip_reputation_entries`     | `list_id`, `cidr cidr`, `added_at`; GiST index on `cidr inet_ops`                                                                                                                                 | Replaced per list in one transaction                          |
| `incidents`                 | `id`, `number` (sequence, shown as `INC-0001`), `title`, `severity`, `status`, `owner_user_id`, `source` (`MANUAL`, `AUTO`), `subject_ref`, `opened_at`, `resolved_at`, `closed_at`, `resolution` | Status machine in SD-152                                      |
| `incident_links`            | `incident_id`, `kind` (`SECURITY_EVENT`, `AUDIT_RANGE`), `event_id`, `from_seq`, `to_seq`, `linked_by`, `linked_at`                                                                               | Unique per target                                             |
| `incident_notes`            | `id`, `incident_id`, `author_user_id`, `body`, `created_at`; `incident_note_revisions` with prior bodies                                                                                          | No delete                                                     |
| `playbooks`                 | `id`, `name`, `version`, `definition jsonb`, `mode` (`DRY_RUN`, `APPROVAL`, `AUTO`), `enabled`, `created_by`, `updated_at`                                                                        | Each save creates a new version row; old versions stay        |
| `playbook_runs`             | `id`, `playbook_id`, `playbook_version`, `trigger_event_id`, `status`, `dry_run`, `idempotency_key` unique, `started_at`, `finished_at`                                                           |                                                               |
| `playbook_run_steps`        | `run_id`, `step_index`, `action`, `params jsonb`, `status`, `result_class`, `started_at`, `finished_at`                                                                                           | No secrets or message bodies                                  |
| `playbook_approvals`        | `id`, `run_id`, `step_index`, `requested_at`, `expires_at`, `decided_by`, `decision`, `decided_at`                                                                                                |                                                               |
| `audit_merkle_nodes`        | `level`, `idx`, `hash bytea` (primary key `(level, idx)`)                                                                                                                                         | Append-only (trigger and privileges), completed subtrees only |
| `audit_checkpoints`         | `tree_size`, `root_hash bytea`, `signed_at`, `key_id`, `signature bytea`, `note text`                                                                                                             | Append-only                                                   |
| `audit_witness_receipts`    | `tree_size`, `witness`, `kind` (`COSIGNATURE`, `RFC3161`, `FILE`, `GIT`), `receipt bytea`, `received_at`, `status`                                                                                | Append-only                                                   |

---

## 4. Permission additions

| Code                | Meaning                                                         | Roles                  |
| ------------------- | --------------------------------------------------------------- | ---------------------- |
| `intel:read`        | Read reputation lists, feed status and the ATT&CK coverage page | Administrator, Auditor |
| `intel:manage`      | Enable feeds, trigger an update, configure AbuseIPDB            | Administrator          |
| `incidents:read`    | List and read incidents                                         | Administrator, Auditor |
| `incidents:manage`  | Create, link, annotate, change status, assign                   | Administrator          |
| `incidents:export`  | Produce a signed evidence bundle                                | Administrator, Auditor |
| `playbooks:read`    | Read playbooks, runs and approvals                              | Administrator, Auditor |
| `playbooks:manage`  | Create, edit, enable, switch mode, use the kill switch          | Administrator          |
| `playbooks:approve` | Approve or reject a pending step                                | Administrator          |
| `audit-log:proof`   | Download inclusion and consistency proofs and checkpoints       | Administrator, Auditor |

The **Auditor** role (SD-151) also holds `audit-log:read`, `audit-log:export`, `audit-log:verify`, `security-events:read` and `ip-blocks:read`, and nothing else. It has no ticket access, like the Administrator.

---

## 5. API contract

### 5.1 New endpoints (summary)

| Method and path                                                                        | Purpose                                            | Permission                    |
| -------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------- |
| `GET /api/admin/intel/lists`, `PATCH .../{id}`, `POST .../{id}/update`                 | Reputation list status, enable, manual update      | `intel:read` / `intel:manage` |
| `GET /api/admin/attack-coverage`, `GET .../navigator-layer`                            | ATT&CK matrix and Navigator layer                  | `intel:read`                  |
| `GET/POST /api/admin/incidents`, `GET/PATCH /api/admin/incidents/{id}`                 | Incident list, create, read, status and assignment | `incidents:read` / `:manage`  |
| `POST /api/admin/incidents/{id}/links`, `DELETE .../links/{linkId}`                    | Link or unlink events and audit ranges             | `incidents:manage`            |
| `POST /api/admin/incidents/{id}/notes`, `PATCH .../notes/{noteId}`                     | Add a note, edit with revision                     | `incidents:manage`            |
| `POST /api/admin/incidents/{id}/evidence`                                              | Produce and download the signed bundle             | `incidents:export`            |
| `GET/POST/PATCH /api/admin/playbooks[/{id}]`, `POST .../simulate`                      | Manage, dry-run on historical events               | `playbooks:read` / `:manage`  |
| `GET /api/admin/playbook-runs[/{id}]`                                                  | Run history                                        | `playbooks:read`              |
| `POST /api/admin/playbook-approvals/{id}/decision`                                     | Approve or reject                                  | `playbooks:approve`           |
| `PUT /api/admin/soar/kill-switch`                                                      | Disable or enable all playbooks                    | `playbooks:manage`            |
| `GET /api/admin/audit-log/checkpoints`, `.../proof/{seq}`, `.../consistency?from=&to=` | Checkpoints and proofs                             | `audit-log:proof`             |

### 5.2 Error codes added (messages Polish)

`INCIDENT_TRANSITION_INVALID` (409), `PLAYBOOK_INVALID` (422), `PLAYBOOK_ACTION_FORBIDDEN` (422), `SOAR_DISABLED` (409), `APPROVAL_EXPIRED` (409), `APPROVAL_SAME_ACTOR` (403), `PROOF_NOT_AVAILABLE` (404, entry not yet covered by a checkpoint).

---

## 6. Detailed implementation backlog

### Task ID map

| Epic                              | Tasks                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| 29 Threat Intelligence and ATT&CK | 29.1 = SD-146, 29.2 = SD-147, 29.3 = SD-148, 29.4 = SD-149                               |
| 30 Incident Case Management       | 30.1 = SD-150, 30.2 = SD-151, 30.3 = SD-152, 30.4 = SD-153, 30.5 = SD-154, 30.6 = SD-155 |
| 31 SOAR-lite Playbooks            | 31.1 = SD-156, 31.2 = SD-157, 31.3 = SD-158, 31.4 = SD-159, 31.5 = SD-160, 31.6 = SD-161 |
| 32 Merkle Audit Log and Witness   | 32.1 = SD-162, 32.2 = SD-163, 32.3 = SD-164, 32.4 = SD-165, 32.5 = SD-166, 32.6 = SD-167 |

---

## EPIC 29 — Threat intelligence and ATT&CK

### SD-146 / Task 29.1 — Security event enrichment pipeline

**Priority:** P0 · **Size:** M · **Labels:** [DESIGN], backend, security · **Depends on:** SD-140, SD-106

**Objective:** Attach context (country, reputation) to security events when they are created, without ever slowing or failing the request that caused them.

**Implementation checklist**

- Migration adding `enrichment jsonb` and `attack_techniques text[]` to `security_events`; DTOs in `security/schemas.ts` expose both (country and list names only; no coordinates).
- `server/intel/enrich.ts`: `enrich({ ip })` returns `{ geo: { country }, reputation: { lists: string[] } }` from local sources only (SD-140 GeoIP and SD-147 tables); called inside the event write in `security/events.ts`, bounded by a 50 ms budget; on timeout or error store `{}` and count a metric.
- Remote enrichment (AbuseIPDB, SD-147) happens afterwards in a background worker that updates `enrichment` by event id, never in the request path.
- Enrichment is **not** written to `audit_log` (chain stays small and personal data minimal), D6-05.
- Update the admin security-events DTO, the Angular list and detail (country flag text, list badges).

**Acceptance criteria**

- [ ] An event from a fixture address in the GeoIP database stores the expected country; a private address stores none (SEC-154).
- [ ] A throwing or slow enricher cannot delay or fail the request that raised the event (SEC-154).
- [ ] No audit entry contains enrichment fields (schema test).
- [ ] The security-events API never returns coordinates.
- [ ] Minimum 80% test coverage for this module.

### SD-147 / Task 29.2 — IP reputation feeds and optional AbuseIPDB

**Priority:** P1 · **Size:** L · **Labels:** [HARDENING], backend, database, security · **Depends on:** SD-146, SD-117 (SSRF guard)

**Objective:** Know when traffic comes from a Tor exit node, a known-bad network or an abusive address, using public lists downloaded safely and matched in the database.

**Implementation checklist**

- Migration for `ip_reputation_lists` and `ip_reputation_entries` (section 3) with a GiST index; seed list rows (Tor bulk exit list, Spamhaus DROP, FireHOL level 1), each `enabled = false`; permissions `intel:read` and `intel:manage` in the matrix and docs.
- Updater job (`npm run intel:update` and a scheduled worker, only when `INTEL_FEEDS_ENABLED=true`): fetch through the shared SSRF-guarded HTTP client (HTTPS only, 5 s connect, 20 s total, size cap `INTEL_FEED_MAX_BYTES`, content type `text/plain`), parse line-based, validate each CIDR, skip comments, reject the update if more than 1% of lines are invalid or the list shrinks by more than 50% (sanity gate), then replace the list's entries in one transaction.
- Lookup `reputationFor(ip)` using `cidr >>= $1::inet` (IPv4 and IPv6); private, loopback and the configured trusted proxy addresses are never reported.
- AbuseIPDB (optional): key from `ABUSEIPDB_API_KEY`, request only when the address appears in a HIGH-severity event, cache 24 hours in Redis, respect `ABUSEIPDB_DAILY_BUDGET`, key never logged, outage returns neutral.
- Reputation is a **signal** (risk engine weight, event badge), not a block; blocking stays a playbook decision (SD-157).

**Acceptance criteria**

- [ ] Fixture feeds served by a local stub load and match IPv4 and IPv6 CIDRs; private and own addresses never match (SEC-155).
- [ ] A truncated, oversized, malformed or 70%-shrunk download leaves the previous entries untouched (SEC-155).
- [ ] With the default configuration no network request is made (network-guard test); AbuseIPDB is inert without a key and respects the daily budget and cache (SEC-156).
- [ ] The API key never appears in logs, errors or DTOs.
- [ ] Minimum 80% test coverage for this module.

### SD-148 / Task 29.3 — MITRE ATT&CK mapping for every rule and event type

**Priority:** P0 · **Size:** M · **Labels:** [STANDARD], backend, docs · **Depends on:** SD-146

**Objective:** Classify detections in the common vocabulary, and make it impossible to add a rule without a classification.

**Implementation checklist**

- Commit a pinned subset of the ATT&CK Enterprise dataset as `apps/backend/src/server/intel/attack-techniques.json` (technique ID, name, tactic IDs, and the dataset version and date in the header), generated by a script `npm run intel:attack:update` from the official STIX bundle; the update script is manual and never run in tests.
- Each rule module under `server/detection/rules/` exports `attack: string[]`; a registry `event-attack-map.ts` maps security event types and audit actions that are not rule-driven.
- Initial mapping to confirm against the pinned dataset (each entry reviewed): failed-login burst and account lock to Brute Force (T1110); password spraying to T1110.003; credential stuffing to T1110.004; success after failures and risk-based impossible travel to Valid Accounts (T1078); trap account and honeytoken use to Valid Accounts (T1078) with deception noted; audit tamper detection to Indicator Removal (T1070) and Stored Data Manipulation (T1565.001); webhook secret probing to Exploit Public-Facing Application (T1190).
- Tests: every rule exports at least one ID; every ID exists in the dataset; every event type either has a mapping or is explicitly listed as unmapped with a reason; adding a rule without `attack` fails the test.
- Security events store `attack_techniques` at creation; the UI shows technique chips linking to the official page (static URL built from the ID, not from stored text).

**Acceptance criteria**

- [ ] Removing the `attack` export from a rule fails the test suite (SEC-157).
- [ ] An ID that is not in the pinned dataset fails the test suite (SEC-157).
- [ ] Events created by the two existing rules carry the expected technique IDs.
- [ ] Minimum 80% test coverage for this module.

### SD-149 / Task 29.4 — ATT&CK coverage page and Navigator layer export

**Priority:** P1 · **Size:** M · **Labels:** [PORTFOLIO], frontend, backend · **Depends on:** SD-148

**Objective:** Show what SecureDesk can detect, and what it has seen, on one page.

**Implementation checklist**

- `GET /api/admin/attack-coverage`: tactics in matrix order, techniques with `coveredBy` (rule and event-type IDs) and `count30d` (events with that technique in the last 30 days); permission `intel:read`.
- `GET /api/admin/attack-coverage/navigator-layer`: JSON in ATT&CK Navigator layer format (version pinned in the code), with covered techniques scored 1 and observed ones scored by count bucket, no personal data.
- Angular page `/admin/attack-coverage`: matrix grid (covered, observed, uncovered), filter by tactic, click a technique to list the rules and recent events, download button for the layer.
- Documentation of how to import the layer into the public Navigator.

**Acceptance criteria**

- [ ] Only users with `intel:read` can read the page and the layer; other roles get `403`, anonymous `401` (SEC-158).
- [ ] The exported layer validates against the Navigator layer schema (fixture test) and contains no event content.
- [ ] The page shows the two existing rules as covering their techniques.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 30 — Incident case management

### SD-150 / Task 30.1 — Incident data model, numbering and permissions

**Priority:** P0 · **Size:** M · **Labels:** [DESIGN], backend, database · **Depends on:** SD-107

**Objective:** Create the storage and rules for incidents before any API or UI.

**Implementation checklist**

- Migration for `incidents`, `incident_links`, `incident_notes`, `incident_note_revisions` (section 3); human number from a database sequence formatted as `INC-0001`; CHECK constraints for severity (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) and status (`NEW`, `TRIAGED`, `INVESTIGATING`, `CONTAINED`, `RESOLVED`, `CLOSED`, `FALSE_POSITIVE`).
- Permissions `incidents:read`, `incidents:manage`, `incidents:export` in `codes.ts`, `matrix.ts`, `docs/permissions.md`, and the doc-sync test.
- Audit catalogue entries (closed list, strict details with ids only): `INCIDENT_CREATED`, `INCIDENT_STATUS_CHANGED`, `INCIDENT_ASSIGNED`, `INCIDENT_LINK_ADDED`, `INCIDENT_LINK_REMOVED`, `INCIDENT_NOTE_ADDED`, `INCIDENT_NOTE_EDITED`, `INCIDENT_EXPORTED`. **Note text is never copied into the audit log.**
- No `UPDATE` of a note body in place: edits insert a revision; no `DELETE` route or privilege on notes and revisions (privileges and a guard test).
- Update `docs/database-schema.md`, the ER diagram test.

**Acceptance criteria**

- [ ] Migration applies to an empty database and one with existing events; the ER diagram test passes.
- [ ] The application role has no `DELETE` on `incident_notes` or `incident_note_revisions` (SEC-162).
- [ ] `matrix.test.ts` proves the new permissions are held by exactly the roles of section 4.
- [ ] Minimum 80% test coverage for this module.

### SD-151 / Task 30.2 — Auditor role (read-only)

**Priority:** P0 · **Size:** M · **Labels:** [DESIGN], backend, frontend, security · **Depends on:** SD-150

**Objective:** Add the role Module 3 anticipated: a person who can inspect and verify, and change nothing.

**Implementation checklist**

- `ROLES.AUDITOR = 'auditor'`; seed the role, its permissions (section 4) and a demo account `auditor1`; migration for the role row; `docs/permissions.md` role table.
- Backend: the Auditor reads the audit log, exports, verifies, proofs, security events, IP blocks, intel, incidents, playbooks; no acknowledgement, unlock, clear, create or update permission anywhere; no ticket access (all ticket routes `403`, like Administrator).
- Conformance test: iterate the route registry (SD-114); for every route with a non-`GET` method, the Auditor receives `403` (or `401` for anonymous); `GET` routes outside the Auditor's permissions receive `403`.
- Frontend: navigation shows only permitted entries; action buttons (acknowledge, unlock, edit) hidden through the permission directive; backend remains the authority.
- User administration: the Administrator can assign the role; protected `ADMIN` cannot become an Auditor.

**Acceptance criteria**

- [ ] The conformance test passes: no mutating route allows the Auditor (SEC-163).
- [ ] The Auditor can read, export and verify the audit log and sees incidents read-only (SEC-163).
- [ ] Every ticket route answers the Auditor with `403` (SEC-164).
- [ ] The documented permission matrix and the code agree (doc-sync test).
- [ ] Minimum 80% test coverage for this module.

### SD-152 / Task 30.3 — Incident lifecycle API

**Priority:** P0 · **Size:** L · **Labels:** [DESIGN], backend, security · **Depends on:** SD-150, SD-151

**Objective:** Create, investigate and close incidents through a state machine, with automatic creation from critical alerts.

**Implementation checklist**

- Routes in section 5.1; strict schemas; title 1 to 120 and note 1 to 4000 characters, sanitised for display; severity defaults from the triggering alert.
- State machine in `server/incidents/transitions.ts`: allowed moves `NEW→TRIAGED→INVESTIGATING→CONTAINED→RESOLVED→CLOSED`, plus `FALSE_POSITIVE` from any open state and reopen from `RESOLVED`; `RESOLVED` and `CLOSED` require a resolution text; others return `409 INCIDENT_TRANSITION_INVALID` (SEC-159).
- Links: only existing security event IDs and audit sequence ranges (`from ≤ to`, within the existing log, at most 10,000 entries per range); linking twice is idempotent (SEC-160).
- Auto-open: a cursor-based consumer (D6-04) opens an incident for each new `CRITICAL` `DETECTION_ALERT` when `incident_auto_open_min_severity` allows; dedupe: if an open incident has the same `subject_ref` and rule within 1 hour, append the event as a link instead (SEC-161).
- Every change is a state change with an audit entry in the same transaction (fail closed).
- Assignment only to an active user holding `incidents:manage`.

**Acceptance criteria**

- [ ] Invalid transitions and missing resolution texts are refused; the table in the doc matches the code (SEC-159).
- [ ] Links to unknown events or invalid ranges are refused; a duplicate link changes nothing (SEC-160).
- [ ] Two critical alerts for the same subject and rule within an hour yield one incident with two linked events (SEC-161).
- [ ] Audit entries contain ids and states, never note or resolution text (SEC-166).
- [ ] Minimum 80% test coverage for this module.

### SD-153 / Task 30.4 — Incident UI with merged timeline

**Priority:** P1 · **Size:** L · **Labels:** [PORTFOLIO], frontend · **Depends on:** SD-152

**Objective:** An analyst's workspace: list, filter, open a case, see everything that happened in order.

**Implementation checklist**

- Angular routes `/admin/incidents` (filters: status, severity, owner, date, technique) and `/admin/incidents/:id`.
- Detail: header with status control (only legal next states offered), owner picker, linked events with ATT&CK chips and enrichment, audit ranges expandable to the entries (reusing the audit table component), notes with revision history, and a **merged timeline** built server-side from: incident audit entries, linked security events, linked audit entries, notes, playbook runs.
- "Open incident" button on security events and on audit-drawer alerts; the Auditor sees everything read-only (permission directive).
- Plain-text rendering everywhere (interpolation only, no unsafe HTML); keyboard-accessible controls; component tests for state transitions and read-only mode.

**Acceptance criteria**

- [ ] The timeline shows items from all sources in chronological order with source labels.
- [ ] The Auditor sees no editing controls and the backend refuses attempts (SEC-163).
- [ ] Note text containing markup renders as text (extends SEC-26).
- [ ] Minimum 80% test coverage for this module.

### SD-154 / Task 30.5 — Signed evidence bundle export

**Priority:** P1 · **Size:** L · **Labels:** [STANDARD], backend, security · **Depends on:** SD-152, SD-163 (shared signing code)

**Objective:** Produce a self-contained, tamper-evident package that an auditor can verify without the application.

**Implementation checklist**

- `POST /api/admin/incidents/{id}/evidence` (permission `incidents:export`, step-up required) builds a ZIP in memory (size cap 50 MB): `incident.json` (incident, links, notes without author secrets), `audit-entries.jsonl` (the linked entries with their hashes), `events.json` (linked security events, DTO-safe), `verification.json` (chain verification result and, once available, inclusion proofs and the latest checkpoint), `manifest.json` (SHA-256 of every file, generation time UTC, application version), and `manifest.sig` (Ed25519 detached signature with `INCIDENT_SIGNING_KEY_PATH`'s key; the public key is shown on `docs/` and in the bundle).
- The export audit entry (`INCIDENT_EXPORTED`) is written **before** data is sent (SEC-81 pattern) and records the incident id, byte size and file count.
- A standalone script `tools/audit-verifier/verify-bundle.mjs` checks the manifest hashes and the signature using only Node's built-in crypto; SD-165 later builds the full log verifier on the same module.
- CSV or spreadsheet formats are not offered here, so no formula-injection surface exists.

**Acceptance criteria**

- [ ] The manifest hashes match the files and the signature verifies with the published public key (SEC-165).
- [ ] Altering any file or the manifest makes the verifier fail naming the file (SEC-165).
- [ ] The export entry exists before the response body is sent; a failing audit write blocks the export.
- [ ] A missing or world-readable signing key file refuses export and start-up in production.
- [ ] Minimum 80% test coverage for this module.

### SD-155 / Task 30.6 — Incident metrics, tests and documentation

**Priority:** P1 · **Size:** M · **Labels:** [DESIGN], backend, testing, docs · **Depends on:** SD-152, SD-153

**Objective:** Measure response (time to detect and time to resolve) and close the epic.

**Implementation checklist**

- Metrics endpoint for the UI: mean time to detect (event time to incident opened), mean time to resolve (opened to resolved), counts by severity and status, last 30 and 90 days; computed in SQL, tested with the fake clock (SEC-167).
- Prometheus metrics added to SD-121's set: `incidents_open{severity}`, `incident_mttr_seconds` histogram.
- E2E: an attack (bot-sim) raises a critical alert, an incident opens automatically, an administrator investigates, links the audit range, resolves, exports the bundle and the verifier accepts it; the Auditor sees it read-only.
- Update `docs/testing.md`, `docs/permissions.md`, the threat model, `docs/incidents.md` (workflow, states, evidence verification).

**Acceptance criteria**

- [ ] MTTD and MTTR match hand-computed values on a fixture (SEC-167).
- [ ] The E2E journey passes three consecutive runs.
- [ ] `docs/incidents.md` documents the state machine and the verification command.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 31 — SOAR-lite playbooks

### SD-156 / Task 31.1 — Playbook model, strict definition schema and permissions

**Priority:** P0 · **Size:** M · **Labels:** [DESIGN], [HARDENING], backend, database, security · **Depends on:** SD-148, SD-152

**Objective:** Describe responses as validated data with no way to run arbitrary code.

**Implementation checklist**

- Migration for `playbooks`, `playbook_runs`, `playbook_run_steps`, `playbook_approvals`; permissions `playbooks:read`, `playbooks:manage`, `playbooks:approve` in the matrix and docs.
- Definition (Zod strict, versioned `schemaVersion: 1`), example:

  ```json
  {
    "schemaVersion": 1,
    "trigger": { "ruleIds": ["failed-login-burst"], "minSeverity": "HIGH" },
    "conditions": [{ "field": "enrichment.reputation.lists", "op": "notEmpty" }],
    "steps": [
      { "action": "BLOCK_IP", "params": { "ttlMinutes": 60 } },
      { "action": "OPEN_INCIDENT", "params": { "severity": "HIGH" } },
      { "action": "NOTIFY_WEBHOOK", "params": {} }
    ],
    "cooldownMinutes": 30
  }
  ```

- Whitelisted condition fields (event type, severity, rule ID, ATT&CK technique, country, reputation list, address kind), operators (`eq`, `in`, `gte`, `notEmpty`), at most 10 conditions and 8 steps; unknown keys, actions or operators, strings over 200 characters and any value matching a secret-key pattern are refused; **no templating and no expression evaluation**.
- Mode `AUTO` is rejected at save when any step is account-affecting (`LOCK_ACCOUNT`, `BLOCK_USER`, `FORCE_PASSWORD_RESET`, `REVOKE_USER_SESSIONS`): `422 PLAYBOOK_ACTION_FORBIDDEN` (SEC-168, D6-03).
- Every save inserts a new version; audit entries `PLAYBOOK_CREATED`, `PLAYBOOK_UPDATED`, `PLAYBOOK_ENABLED`, `PLAYBOOK_DISABLED`, `PLAYBOOK_MODE_CHANGED` with ids and versions.

**Acceptance criteria**

- [ ] Unknown actions, unknown fields, oversized definitions and secret-looking keys are refused (SEC-168).
- [ ] `AUTO` with an account-affecting step is refused at save (SEC-168).
- [ ] Editing creates a new version and keeps the previous one; runs reference the version they used.
- [ ] Only the Administrator holds `playbooks:manage` and `playbooks:approve` (SEC-176).
- [ ] Minimum 80% test coverage for this module.

### SD-157 / Task 31.2 — Action library with guard rails

**Priority:** P0 · **Size:** L · **Labels:** [HARDENING], backend, security · **Depends on:** SD-156, SD-135

**Objective:** Implement the actions as thin, typed, idempotent wrappers over existing services, each with its own safety checks.

**Implementation checklist**

- Actions and their targets (derived from the **trigger event**, never from free text): `BLOCK_IP` (ip-block service, TTL 1 to 1,440 minutes), `LOCK_ACCOUNT` (existing temporary lock), `BLOCK_USER` (administrative block, always approval), `REVOKE_USER_SESSIONS`, `FORCE_PASSWORD_RESET` (sets `must_change_password` and revokes sessions), `NOTIFY_WEBHOOK` (configured `ALERT_WEBHOOK_URL` only, existing dispatcher), `SEND_EMAIL` (to active Administrators through the mail service), `OPEN_INCIDENT`, `ADD_NOTE`.
- Guard rails in `server/soar/guards.ts`: never act on the protected `ADMIN` account; never block loopback, private, link-local, the trusted-proxy addresses or anything in `SOAR_NEVER_BLOCK_CIDRS`; never block an address that has an active full session of an Administrator within the last 30 minutes; global cap `SOAR_MAX_ACTIONS_PER_HOUR` after which the circuit breaker trips, further actions are refused and a CRITICAL alert is raised once per hour.
- Idempotent: performing an action that is already in effect succeeds as a no-op with `result_class = ALREADY_APPLIED`.
- Where an undo exists (`BLOCK_IP`, `LOCK_ACCOUNT`) the run step records how to undo it, and the UI offers it (audited).
- Each action writes its own audit entry (`SOAR_ACTION_EXECUTED` with action, target reference, run id, result class; no secrets, no message bodies) in the same transaction as its effect.

**Acceptance criteria**

- [ ] `ADMIN`, loopback, private, proxy and allowlisted addresses are never targeted, even when the event names them (SEC-172).
- [ ] After the hourly cap, further actions are refused and exactly one CRITICAL alert is raised (SEC-172).
- [ ] Repeating an action reports `ALREADY_APPLIED` and changes nothing.
- [ ] `NOTIFY_WEBHOOK` can only reach the configured destination (SEC-175).
- [ ] Minimum 80% test coverage for this module.

### SD-158 / Task 31.3 — Execution engine with durable runs

**Priority:** P0 · **Size:** L · **Labels:** [DESIGN], backend, database · **Depends on:** SD-157, SD-113

**Objective:** Run matching playbooks reliably: exactly once per trigger, resumable after a crash, stoppable at any time.

**Implementation checklist**

- Trigger intake: a persisted cursor over `security_events` (D6-04); a worker polls every 2 seconds and the event bus nudges it immediately; for each new event find enabled playbooks whose trigger and conditions match.
- Create a `playbook_runs` row with `idempotency_key = playbook_id:version:event_id` (unique), so duplicates and restarts never double-run; per-playbook-and-subject cooldown from the definition.
- Step executor: sequential steps with per-step timeout (10 s), retries for transient failures only (2 attempts), the status of every step persisted before and after; on crash the next worker resumes at the first non-finished step and never repeats a finished one (SEC-174).
- Mode handling: `DRY_RUN` records what each step would do and executes nothing (SEC-169); `APPROVAL` creates a pending approval before the first account-affecting step (SD-159); `AUTO` runs containment steps only.
- Kill switch `soar_enabled` (default **off** until enabled): checked before every step; turning it off stops runs at the next step boundary and marks them `ABORTED` (SEC-173).
- Metrics: runs by status, step durations, queue lag; alert `SOAR_LAG` when the cursor lags more than five minutes.

**Acceptance criteria**

- [ ] The same event delivered twice, or a worker restart, produces one run and no repeated finished step (SEC-174).
- [ ] A `DRY_RUN` playbook changes nothing but records its plan (SEC-169).
- [ ] Switching the kill switch off during a run stops it at the next step (SEC-173).
- [ ] An attack through the bot simulator leads to a `BLOCK_IP` run within five seconds and a second alert inside the cooldown starts no new run (SEC-171).
- [ ] Minimum 80% test coverage for this module.

### SD-159 / Task 31.4 — Approval workflow

**Priority:** P1 · **Size:** M · **Labels:** [HARDENING], backend, security · **Depends on:** SD-158

**Objective:** Let a human decide before access-changing actions, with optional four-eyes control.

**Implementation checklist**

- A pending approval records the planned step, target reference and the evidence (event and incident links); expires after `approval_ttl_minutes` (default 60, range 5 to 1,440), then the run ends `EXPIRED` (SEC-170).
- `POST /api/admin/playbook-approvals/{id}/decision` (permission `playbooks:approve`, step-up required): approve executes the step once, reject ends the run; deciding twice or after expiry returns `409` (`APPROVAL_EXPIRED`).
- Setting `soar_four_eyes` (default off): the approver must differ from the administrator who last edited the playbook (`403 APPROVAL_SAME_ACTOR`, SEC-170).
- Notification mail to administrators on a new pending approval (mail service) and a banner entry in the admin UI; no secrets in the message.
- Audit entries `SOAR_APPROVAL_REQUESTED`, `SOAR_APPROVAL_DECIDED`.

**Acceptance criteria**

- [ ] Approve executes exactly once; reject and expiry execute nothing (SEC-170).
- [ ] With four-eyes on, the editing administrator cannot approve their own playbook's step (SEC-170).
- [ ] Deciding twice or after expiry is refused.
- [ ] Minimum 80% test coverage for this module.

### SD-160 / Task 31.5 — Playbook UI, run history and the historical simulator

**Priority:** P1 · **Size:** L · **Labels:** [PORTFOLIO], frontend, backend · **Depends on:** SD-158, SD-159

**Objective:** Operate playbooks without editing JSON by hand, and see what a playbook **would have done** before enabling it.

**Implementation checklist**

- Angular `/admin/playbooks`: form-based editor generated from the definition schema (no free-text expression field), mode switch with a confirmation dialog that explains the consequences, enable toggle, the global kill switch with a visible state in the app shell.
- Run history with step results and undo buttons where available; approvals inbox with evidence and Approve and Reject buttons.
- `POST /api/admin/playbooks/{id}/simulate`: replays the last N (at most 500) security events through the **pure matcher** and returns which would have triggered and which steps would have run, with the guard-rail decisions; changes nothing (SEC-169).
- Auditor sees all read-only.

**Acceptance criteria**

- [ ] The simulator reports matches and guard-rail refusals for historical events and writes no run, action or audit mutation other than its own read record (SEC-169).
- [ ] The editor cannot produce an invalid definition (form validation mirrors the schema; the server still validates).
- [ ] The kill switch state is visible on every admin page.
- [ ] Minimum 80% test coverage for this module.

### SD-161 / Task 31.6 — SOAR end-to-end tests, safeguards and documentation

**Priority:** P0 · **Size:** M · **Labels:** [FOUNDATION], testing, docs · **Depends on:** SD-158, SD-159, SD-160

**Objective:** Prove the whole loop and the safeguards, and document the operating model.

**Implementation checklist**

- Integration test chain: bot-sim spraying, alert, playbook `BLOCK_IP` plus `OPEN_INCIDENT`, address blocked, incident exists with the run linked (SEC-177).
- Safeguard tests: protected `ADMIN`, private address, hourly cap, kill switch, duplicate delivery, crash resume, SSRF on `NOTIFY_WEBHOOK`.
- E2E: an administrator creates a playbook in dry-run, simulates, switches to auto, watches a run, undoes the block.
- `docs/soar.md`: model, schema reference, action catalogue with guard rails, approval and four-eyes, kill switch and break-glass (`npm run admin:unlock`), threat discussion.
- Update `docs/testing.md`, `docs/permissions.md`, threat model, ASVS mapping.

**Acceptance criteria**

- [ ] The bot-sim end-to-end chain passes three consecutive runs.
- [ ] Every safeguard has a SEC-titled test.
- [ ] `docs/soar.md` explains why account-affecting actions cannot run unattended.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 32 — Merkle audit log and off-host witness

### SD-162 / Task 32.1 — Merkle tree over the audit entries

**Priority:** P0 · **Size:** L · **Labels:** [STANDARD], backend, database, security · **Depends on:** SD-107

**Objective:** Add logarithmic inclusion and consistency proofs on top of the existing chain, without changing the chain.

**Implementation checklist**

- `server/audit/merkle.ts` implementing RFC 6962 hashing: leaf hash `SHA-256(0x00 || entry_hash_bytes)` where `entry_hash` is the existing chain hash, node hash `SHA-256(0x01 || left || right)`; root of a tree of `n` leaves by the RFC's recursive split at the largest power of two below `n`.
- Incremental builder: `audit_merkle_nodes (level, idx, hash)` stores completed subtree hashes; appending leaf `n` needs `O(log n)` reads and writes; the builder runs as a background worker from a persisted cursor (it reads new entries in `seq` order), so the hot append path is unchanged; lag is a metric.
- Proof generation: `inclusionProof(seq, treeSize)` and `consistencyProof(oldSize, newSize)` returning arrays of hashes, plus pure verification functions `verifyInclusion` and `verifyConsistency` with no database dependency (reused by the standalone verifier).
- `audit_merkle_nodes` is append-only (trigger plus no `UPDATE`, `DELETE` for the app role), like the log itself.
- Test vectors: the RFC 6962 reference examples (a published 8-leaf tree) and cross-check against a naive recursive implementation in the test only.

**Acceptance criteria**

- [ ] Roots, inclusion proofs and consistency proofs match the reference vectors and the naive implementation for every tree size from 1 to 130 (SEC-178).
- [ ] For a 1,000-entry log every entry has a verifying inclusion proof; changing one leaf makes its proof fail (SEC-179).
- [ ] A consistency proof between two sizes verifies; one taken from a rewritten history fails (SEC-180).
- [ ] The builder resumes after a restart without gaps or duplicate nodes.
- [ ] Minimum 80% test coverage for this module.

### SD-163 / Task 32.2 — Signed checkpoints and key management

**Priority:** P0 · **Size:** L · **Labels:** [STANDARD], backend, security · **Depends on:** SD-162

**Objective:** Periodically commit to the whole log state with a signature made by a key the database administrator does not hold.

**Implementation checklist**

- Checkpoint format following the C2SP checkpoint and signed-note conventions: text body `securedesk-audit\n<tree size>\n<base64 root>\n<UTC timestamp>\n`, then a blank line and one or more `— <key name> <base64 signature>` lines; Ed25519 (RFC 8032); `key_id` is the first four bytes of the SHA-256 of the public key.
- `server/crypto/signing.ts` loads `AUDIT_SIGNING_KEY_PATH` (PEM, PKCS#8, Ed25519): refuses a missing file in production, a mode other than `0600`, a path under the data or any served directory (reuse `security/private-file.ts` from SD-79's work), and logs only the key ID. The key is never in the database, logs, exports or environment values.
- A worker writes a checkpoint every `AUDIT_CHECKPOINT_EVERY_ENTRIES` entries or `AUDIT_CHECKPOINT_EVERY_MINUTES`, whichever comes first, after the builder has covered the tree size; `audit_checkpoints` is append-only; each checkpoint is itself audited as `AUDIT_CHECKPOINT_CREATED` (this entry lands in a later checkpoint, by design).
- Key rotation procedure: `npm run audit:key:rotate` generates a new key, writes a **rotation checkpoint** signed by both the old and the new key, and records the new public key in `docs/audit-keys.md` and the repository; verification accepts any key in the published key list.
- `GET /api/admin/audit-log/checkpoints` (permission `audit-log:proof`) lists them with their signatures and the public keys.

**Acceptance criteria**

- [ ] Signatures verify; altering size, root or time fails verification (SEC-181).
- [ ] A rotation checkpoint carries both signatures, and checkpoints signed by the old key still verify after rotation (SEC-181).
- [ ] The private key is never found in the database, logs or API output; start-up refuses a world-readable key file in production (SEC-187).
- [ ] The checkpoint worker is idempotent across restarts (no duplicate sizes).
- [ ] Minimum 80% test coverage for this module.

### SD-164 / Task 32.3 — Off-host witness publishers and an independent witness service

**Priority:** P0 · **Size:** XL · **Labels:** [STANDARD], [HARDENING], backend, devops, security · **Depends on:** SD-163, SD-101

**Objective:** Make a rewrite of the entire log detectable by giving the world a copy of each checkpoint that the host administrator cannot alter.

**Implementation checklist**

- `interface WitnessPublisher { publish(checkpoint, consistencyProof): Promise<Receipt> }` with implementations: **FilePublisher** (append-only JSONL at `AUDIT_PUBLISH_FILE_PATH`, default for tests and the demo), **HttpWitnessPublisher** (our own witness service), **Rfc3161Publisher** (timestamp token from a TSA at `AUDIT_TSA_URL`), and an optional **GitPublisher** (commit of the checkpoint text to a dedicated repository through the GitHub API with a fine-grained token, off by default).
- Independent witness service `tools/witness/` (small Node server, its own Dockerfile and compose profile `witness` with its own volume and Ed25519 key, run as a separate container to model a separate administrative domain): `POST /add-checkpoint` with the new checkpoint, the previous size and a consistency proof; it verifies the log's signature against the configured public key, verifies **consistency with the last checkpoint it cosigned**, then stores and returns its **cosignature**; on an inconsistent checkpoint it refuses with `409`, keeps the evidence of the conflicting signed checkpoint and exposes it at `/conflicts` (this is the split-view detection, SEC-183).
- Publishing worker: drains unpublished checkpoints in order per publisher, records `audit_witness_receipts`, retries with backoff, never blocks audit writes (SEC-186); `AUDIT_WITNESS_LAG` alert when the newest checkpoint is unpublished for more than 30 minutes.
- RFC 3161: request a `timestamp` over the checkpoint's SHA-256 with `openssl ts -query`-compatible DER, store the token, verification described in SD-165; tests use a local stub TSA with a test certificate.
- SSRF-guarded HTTP client for all outbound calls (SD-117 guard), with the witness URL allowed explicitly.

**Acceptance criteria**

- [ ] The witness refuses a checkpoint whose history is inconsistent with the one it cosigned, and records the conflict (SEC-183).
- [ ] A stubbed TSA token verifies offline against the test certificate (SEC-184).
- [ ] A witness outage does not delay a single audit write; the backlog drains in order after recovery; the lag alert fires after the threshold (SEC-186).
- [ ] `docker compose --profile witness up` runs the witness in a separate container and volume and the app cosigns successfully.
- [ ] Minimum 80% test coverage for this module.

### SD-165 / Task 32.4 — Standalone verifier, proof API and UI

**Priority:** P0 · **Size:** L · **Labels:** [STANDARD], [PORTFOLIO], backend, frontend, security · **Depends on:** SD-162, SD-163, SD-164

**Objective:** Anyone holding an export and a few public keys can check the log with no access to the application or its database.

**Implementation checklist**

- `tools/audit-verifier/verify.mjs` (Node only, `node:crypto`, zero dependencies): inputs `--log audit.jsonl` (the existing JSON Lines export), `--checkpoints checkpoints.txt`, `--keys keys.json` (log and witness public keys), optional `--receipts` and `--tsr`; checks (1) every entry hash against the documented `sd-audit-v1` formula and the chain links, (2) Merkle root equals each checkpoint's root at its size, (3) checkpoint signatures, (4) consistency between consecutive checkpoints, (5) witness cosignatures, (6) RFC 3161 tokens via `openssl ts -verify` when present; machine-readable output and distinct exit codes (0 intact, 1 tampered, 2 inputs invalid, 3 verification incomplete).
- Endpoints: `GET /api/admin/audit-log/proof/{seq}` (inclusion proof against the newest covering checkpoint; `404 PROOF_NOT_AVAILABLE` while the builder has not reached it), `GET .../consistency?from=&to=`, plus the checkpoints list from SD-163; permission `audit-log:proof`; each call audited as a read.
- UI: audit-entry drawer gains "Download proof" (a JSON file the verifier accepts) and shows "Covered by checkpoint #n, witnessed by …"; the integrity panel shows the last checkpoint, last witness receipt and lag.
- The bundle verifier of SD-154 reuses the same module.

**Acceptance criteria**

- [ ] The verifier succeeds on a freshly exported log without network or database access and returns the documented exit codes for tampered and invalid inputs (SEC-185).
- [ ] A downloaded inclusion proof verifies with the verifier for any covered entry.
- [ ] The Auditor can download proofs; other roles get `403` (SEC-163).
- [ ] The verifier works from a clean directory containing only the files and Node.
- [ ] Minimum 80% test coverage for this module.

### SD-166 / Task 32.5 — Extended tamper demonstration and detection of full-chain rewrite

**Priority:** P0 · **Size:** M · **Labels:** [HARDENING], backend, testing, docs · **Depends on:** SD-165

**Objective:** Show the attack that Module 3 documented as undetectable by the chain alone (SEC-86) and prove that checkpoints and the witness now catch it.

**Implementation checklist**

- Extend `npm run audit:tamper-demo` with scenarios: (a) modify one entry; (b) delete the tail; (c) **rewrite an entry and recompute every later hash, anchor and Merkle node** (the attacker has full database and file access but not the signing key and not the witness); (d) replace the whole database with a forged history and a re-signed checkpoint using a different key; (e) conflicting checkpoint presented to the witness.
- Scheduled verification (`audit/scheduled-verification.ts`) additionally verifies the newest checkpoint's root against the recomputed tree and the latest witness receipt, and raises `AUDIT_TAMPER_DETECTED` (CRITICAL) with the finding type `CHECKPOINT_MISMATCH` or `WITNESS_MISMATCH`.
- Update `docs/audit-log.md`, `docs/threat-model.md` residual risk section (the host-administrator attack is now detected unless the attacker also compromises the signing key and the witness), and the README.
- Playwright: verify, tamper in the disposable fixture, verify again and see the checkpoint-based finding.

**Acceptance criteria**

- [ ] Scenario (c) is caught by checkpoint and witness comparison while the chain-only verifier reports intact (SEC-182).
- [ ] Scenario (d) fails signature verification; scenario (e) is refused by the witness and recorded (SEC-182, SEC-183).
- [ ] The scheduled job raises one critical alert per finding without repeats.
- [ ] The documentation states what is still not covered (key and witness both compromised, or loss of every copy).
- [ ] Minimum 80% test coverage for this module.

### SD-167 / Task 32.6 — Module 6 verification, documentation and portfolio write-up

**Priority:** P0 · **Size:** M · **Labels:** [FOUNDATION], [PORTFOLIO], docs, testing · **Depends on:** all P0 tasks of Module 6

**Objective:** Close the module with evidence a reviewer can follow in ten minutes.

**Implementation checklist**

- Add SEC-154 to SEC-188 to `docs/testing.md` and `docs/asvs.json`; extend the threat model with section 8's table; update `docs/architecture.md`, `docs/permissions.md`, `docs/database-schema.md`, README.
- Full journey E2E: attack, enrichment, alert with ATT&CK chips, incident, playbook block, approval of an account action, evidence bundle verification, audit proof verification with the standalone tool.
- Write a case study `docs/case-study-audit-log.md`: from hash chain to witnessed Merkle log, with the tamper demo output and the verifier command (portfolio piece).
- Update the demo recording and the README feature list.

**Acceptance criteria**

- [ ] The E2E journey passes three consecutive runs on CI.
- [ ] SEC-154 to SEC-188 map to real test titles; the ASVS and traceability checks are green.
- [ ] The case study reproduces its own commands from a clean clone.
- [ ] Minimum 80% test coverage for this module.

---

## 7. Security acceptance test matrix

| ID      | Scenario                                                                                          | Expected outcome                                                                   | Evidence             |
| ------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------- |
| SEC-154 | Event from a fixture address; private address; enricher throws or hangs                           | Country stored or none; request unaffected; no enrichment in audit entries         | Integration test     |
| SEC-155 | Feed load: valid, truncated, oversized, malformed, shrunk by 70%; private and own addresses       | Valid loads and matches; others leave previous entries; private never match        | Integration test     |
| SEC-156 | Default configuration; AbuseIPDB without key, over budget, cached                                 | No network request; inert; budget and cache respected; key never logged            | Integration test     |
| SEC-157 | Rule without `attack`; unknown technique ID; unmapped event type                                  | Test suite fails (or listed with a reason)                                         | Unit test            |
| SEC-158 | Coverage page and layer for all roles and anonymous                                               | Administrator and Auditor only; layer schema-valid; no event content               | API test             |
| SEC-159 | Illegal incident transitions; close without resolution text                                       | `409 INCIDENT_TRANSITION_INVALID`                                                  | API test             |
| SEC-160 | Link unknown event, invalid range, duplicate link                                                 | Refused; refused; idempotent                                                       | API test             |
| SEC-161 | Two critical alerts, same subject and rule, within one hour                                       | One incident, two links                                                            | Fake-clock test      |
| SEC-162 | `DELETE` or `UPDATE` on notes and revisions as the app role                                       | Privilege error; edits create revisions                                            | DB test              |
| SEC-163 | Auditor against every route; Auditor reads audit, incidents, proofs                               | Mutations `403`; reads allowed                                                     | Conformance test     |
| SEC-164 | Auditor and Administrator against ticket routes                                                   | `403`                                                                              | API test             |
| SEC-165 | Evidence bundle: verify, alter a file, alter the manifest, wrong key                              | Verifier passes, then fails naming the file                                        | Unit test            |
| SEC-166 | Incident actions and playbook edits                                                               | Audit entries hold ids and states, never note, resolution or message text          | Integration test     |
| SEC-167 | MTTD and MTTR on a fixture with the fake clock                                                    | Equal to hand-computed values                                                      | Unit test            |
| SEC-168 | Playbook with unknown action, extra field, secret-like key, oversized; `AUTO` with account step   | Refused at save                                                                    | API test             |
| SEC-169 | Dry-run playbook; historical simulation                                                           | Plan recorded, nothing executed; guard decisions shown                             | Integration test     |
| SEC-170 | Approval: approve, reject, expire, decide twice, four-eyes same actor                             | Executes once or never; same actor refused                                         | Fake-clock test      |
| SEC-171 | Simulated spraying, playbook `BLOCK_IP`, second alert inside the cooldown                         | Blocked within five seconds; no second run                                         | Integration test     |
| SEC-172 | Event naming `ADMIN`, loopback, private, proxy address; hourly cap exceeded                       | Never targeted; cap trips; one CRITICAL alert                                      | Integration test     |
| SEC-173 | Kill switch during a run                                                                          | Stops at the next step boundary; runs `ABORTED`                                    | Integration test     |
| SEC-174 | Duplicate event delivery; worker crash between steps                                              | One run; no repeated finished step                                                 | Fault-injection test |
| SEC-175 | `NOTIFY_WEBHOOK` with a destination from event data or from the definition                        | Only the configured destination is ever contacted                                  | Integration test     |
| SEC-176 | Playbook permissions across all roles                                                             | Manage and approve: Administrator; read: Administrator and Auditor                 | Matrix test          |
| SEC-177 | End to end: attack, alert, playbook, block, incident linked                                       | All present and linked                                                             | Integration test     |
| SEC-178 | Merkle roots and proofs for sizes 1 to 130                                                        | Match RFC vectors and the naive implementation                                     | Unit test            |
| SEC-179 | Inclusion proofs for 1,000 entries; modified leaf                                                 | All verify; modified fails                                                         | Unit test            |
| SEC-180 | Consistency proof, honest and from a rewritten history                                            | Verifies; fails                                                                    | Unit test            |
| SEC-181 | Checkpoint signature, altered fields, key rotation                                                | Verifies; altered fails; old checkpoints verify after rotation                     | Unit test            |
| SEC-182 | Rewrite one entry and recompute every later hash, anchor and node; forged database with other key | Chain-only passes; checkpoint and witness comparison fails; forged signature fails | Demo + integration   |
| SEC-183 | Witness receives a checkpoint inconsistent with its last cosigned one                             | Refused, conflict recorded                                                         | Integration test     |
| SEC-184 | RFC 3161 token from a stub TSA                                                                    | Verifies offline; tampered token fails                                             | Unit test            |
| SEC-185 | Standalone verifier on intact, tampered and invalid inputs; no network                            | Exit codes 0, 1, 2                                                                 | CLI test             |
| SEC-186 | Witness down during a burst of audit writes                                                       | No write delayed; ordered drain after recovery; lag alert                          | Fault-injection test |
| SEC-187 | Signing key location, mode, presence in DB, logs, exports                                         | Refused in production if unsafe; never leaked                                      | Integration test     |
| SEC-188 | Browser: full detection and response journey                                                      | Passes three times                                                                 | E2E                  |

---

## 8. Threat model additions

| Threat                        | Risk                                                          | Planned control                                                                                        | Test             |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------- |
| Poisoned reputation feed      | A bad list blocks legitimate users or hides attackers         | Feeds only tag, never block; sanity gates; atomic replace; admin enable per list                       | SEC-155          |
| Feed fetch abuse              | Update job used for SSRF or resource exhaustion               | HTTPS-only SSRF-guarded client, size and time caps                                                     | SEC-155          |
| Untagged detections           | Rules drift outside the shared vocabulary                     | Test requires valid ATT&CK IDs                                                                         | SEC-157          |
| Auditor abuse                 | A read-only role gains write access                           | Conformance test over all routes; no mutating permission                                               | SEC-163          |
| Playbook as a weapon          | Attacker triggers automation that locks out victims or admins | Account actions need approval; `ADMIN`, private and proxy addresses protected; hourly cap; kill switch | SEC-168, SEC-172 |
| Playbook injection            | Definition executes code or reaches arbitrary hosts           | Strict data schema, no templates, destinations only from configuration                                 | SEC-168, SEC-175 |
| Replay or duplicate execution | Same alert triggers repeated actions                          | Idempotency key, cooldown, resumable steps                                                             | SEC-174          |
| Approval bypass               | One administrator approves their own automation               | Four-eyes setting; step-up on decision; audit                                                          | SEC-170          |
| Evidence tampering            | A bundle is altered after export                              | Signed manifest, standalone verifier                                                                   | SEC-165          |
| Notes rewritten               | Analysts edit history                                         | Revisions, no delete privilege                                                                         | SEC-162          |
| Full-chain rewrite            | Host administrator rewrites entries, hashes and anchor        | Signed checkpoints, off-host witness, RFC 3161 time stamps                                             | SEC-182          |
| Split view                    | Different parties are shown different histories               | Witness consistency check and conflict evidence                                                        | SEC-183          |
| Signing key theft             | Attacker forges checkpoints                                   | Key outside DB and data directory, mode check, rotation, witness cosignature required to trust         | SEC-187          |
| Witness outage                | Unwitnessed window grows unnoticed                            | Lag alert, ordered backlog drain, writes never blocked                                                 | SEC-186          |

Residual risks to state: an attacker who steals the signing key **and** controls every witness can still forge a history; a TSA or a witness is a third party with its own availability; the Merkle builder is asynchronous, so entries are covered only after the next checkpoint; automation can still act on a wrongly tuned rule within the documented guard rails.

---

## 9. Recommended implementation order and dependencies

- **Phase A (independent of the rest):** SD-162, SD-163, SD-164, SD-165, SD-166. Outcome: the witnessed audit log.
- **Phase B:** SD-146, SD-147, SD-148, SD-149. Outcome: enrichment and ATT&CK.
- **Phase C:** SD-150, SD-151, SD-152, SD-153. Outcome: incidents and the Auditor.
- **Phase D:** SD-154 (needs only the signer of SD-163), SD-155.
- **Phase E:** SD-156, SD-157, SD-158, SD-159, SD-160, SD-161. Outcome: playbooks.
- **Phase F:** SD-167.

```text
SD-107 ─▶ SD-162 ─▶ SD-163 ─▶ SD-164 ─▶ SD-165 ─▶ SD-166
SD-163 ─▶ SD-154 (shares signer; SD-165 later reuses its verifier module)
SD-140 ─▶ SD-146 ─▶ SD-147, SD-148 ─▶ SD-149
SD-107 ─▶ SD-150 ─▶ SD-151 ─▶ SD-152 ─▶ SD-153 ─▶ SD-155
SD-148, SD-152 ─▶ SD-156 ─▶ SD-157 ─▶ SD-158 ─▶ SD-159 ─▶ SD-160 ─▶ SD-161
SD-117 (SSRF guard) ─▶ SD-147, SD-164           SD-113 ─▶ SD-158
all P0 ─▶ SD-167
```

---

## 10. UI and user journeys

| Route / element          | Change                                                                     |
| ------------------------ | -------------------------------------------------------------------------- |
| `/admin/security-events` | Country, list badges, ATT&CK chips, "Open incident"                        |
| `/admin/attack-coverage` | Matrix and Navigator export                                                |
| `/admin/incidents[/:id]` | List, case view, merged timeline, evidence export                          |
| `/admin/playbooks`       | Editor, runs, approvals inbox, simulator, kill switch                      |
| `/admin/audit-log`       | Proof download, checkpoint and witness status in the integrity panel       |
| App shell                | Kill switch state; pending approvals badge; read-only mode for the Auditor |

Journeys: (1) an attacker sprays passwords; the alert carries T1110.003, an incident opens, the playbook blocks the address, the administrator closes the case and exports a signed bundle; (2) an auditor opens the same case read-only, downloads an inclusion proof and verifies it offline; (3) the host administrator rewrites the log and the verification reports a checkpoint mismatch.

---

## 11. Definition of Done

As in `docs/course/backlog-module-4.md` section 10, plus: automation never acts on accounts without approval; every new write is audited by id without free text; cryptographic keys are outside the database and checked at start-up; every proof the application produces can be verified by a tool that does not import the application.

### 11.1 Definition of Done for the entire Module 6

- Events are enriched and mapped to ATT&CK; a coverage page and layer exist.
- Incidents have a state machine, merged timeline, signed evidence export and measured response times; the Auditor role is read-only by test.
- Playbooks run in dry-run, approval and automatic modes with guard rails, a kill switch and durable, idempotent runs.
- The audit log has a Merkle tree, signed checkpoints, an independent witness and a standalone verifier; a full-chain rewrite is detected.
- SEC-154 to SEC-188 are covered; docs, case study and demo are updated; coverage gate green.

---

## 12. Decisions, assumptions and open points

| ID    | Topic                  | Decision                                                                                                   | Status      |
| ----- | ---------------------- | ---------------------------------------------------------------------------------------------------------- | ----------- |
| D6-01 | Auditor                | One new role, read-only; Administrators own incidents                                                      | Confirmed   |
| D6-02 | Rules versus playbooks | Rules stay TypeScript modules; playbooks are validated data                                                | [DESIGN]    |
| D6-03 | Automatic actions      | Automatic mode: contain addresses, notify, record only; account-affecting actions need approval            | [HARDENING] |
| D6-04 | Delivery               | Consumers use persisted cursors over the database; the event bus only reduces latency                      | [DESIGN]    |
| D6-05 | Enrichment storage     | Stored on `security_events`, never in `audit_log`                                                          | [DESIGN]    |
| D6-06 | Merkle leaves          | Leaf is the existing chain `entry_hash`, so `sd-audit-v1` stays unchanged                                  | [DESIGN]    |
| D6-07 | Tree construction      | Asynchronous builder and checkpoints, so audit writes never wait on proofs                                 | [DESIGN]    |
| D6-08 | Witness protocol       | Own small JSON protocol modelled on the C2SP witness idea; not a drop-in for public transparency witnesses | [DESIGN]    |
| D6-09 | Time stamps            | RFC 3161 token verified with `openssl ts -verify` in the verifier when present                             | [DESIGN]    |
| D6-10 | New permissions        | `intel:*`, `incidents:*`, `playbooks:*`, `audit-log:proof`                                                 | [DESIGN]    |

### 12.1 Open points

- **O6-01** Which public TSA to document (for example FreeTSA); the demo uses a local stub.
- **O6-02** Whether to publish checkpoints to a dedicated public Git repository by default, as a free public witness (SD-164 `GitPublisher`).
- **O6-03** The ATT&CK dataset version to pin (decide when SD-148 starts) and the policy for updating it.
- **O6-04** Whether `REVOKE_USER_SESSIONS` should be allowed in automatic mode for non-privileged users (currently approval-only).

---

## 13. Recommended final verification sequence

1. `docker compose --profile witness --profile observability up --build`; seed; enable feeds with fixtures.
2. Run `npm run bot-sim`; see the alert with ATT&CK chips and enrichment; see the incident open; see the dry-run then automatic playbook block the address.
3. Create an approval-mode playbook with `FORCE_PASSWORD_RESET`; approve it as a second administrator (four-eyes on); confirm sessions were revoked.
4. Resolve the incident, export the bundle, run `node tools/audit-verifier/verify-bundle.mjs`.
5. Download an inclusion proof for one audit entry; verify it with the standalone verifier on a machine without the app.
6. Run `npm run audit:tamper-demo`; observe scenarios (a) to (e) and the checkpoint-based findings; stop the witness and watch the lag alert.
7. Sign in as `auditor1`; confirm everything is visible and nothing can be changed.
8. Run `npm test`, the E2E suite three times and the ASVS check.

---

## 14. References

- MITRE ATT&CK Enterprise and ATT&CK Navigator layer format; NIST SP 800-61 rev. 3; NIST SP 800-92.
- RFC 6962 (Certificate Transparency), RFC 8032 (EdDSA), RFC 3161 (Time-Stamp Protocol); C2SP signed-note, tlog-checkpoint and tlog-witness specifications; Trillian and Sigstore Rekor design notes.
- OWASP Logging Cheat Sheet, OWASP Top 10 A09; SOAR playbook design guidance (NIST SP 800-61, vendor-neutral).
- DB-IP, Spamhaus DROP, FireHOL and Tor Project bulk exit list documentation; AbuseIPDB API documentation.
