#!/usr/bin/env bash
# =============================================================================
# SecureDesk - Modules 4 to 7 (Platform, Identity, Detection and response, Helpdesk and data protection)
# GitHub bootstrap: labels, milestones and 102 issues generated from docs/course/backlog-module-{4,5,6,7}.md.
# GENERATED FILE: edit the backlog documents and run scripts/issues/generate_issues_modules_4_7.py again.
#
# Usage (from inside a clone of the target repository, or with GH_REPO set):
#   chmod +x scripts/issues/create_issues_modules_4_7.sh && scripts/issues/create_issues_modules_4_7.sh
#   GH_REPO=owner/securedesk SD_ASSUME_YES=1 scripts/issues/create_issues_modules_4_7.sh
#   SD_DRY_RUN=1 scripts/issues/create_issues_modules_4_7.sh      # print what would be created, call nothing
#   SD_ONLY_MODULE=4 scripts/issues/create_issues_modules_4_7.sh  # create only one module's issues
#
# Requirements: GitHub CLI (gh) authenticated with the 'repo' scope.
# Labels are idempotent (--force). Milestones and issues are created only when missing, so a run that
# failed half-way can simply be started again (issues are matched by exact title).
# Epics 19-37 continue the numbering of Modules 1-3 (Epics 1-18); tasks continue at SD-93.
#
# Size scale used in every issue:
#   S  = up to 1 person-day
#   M  = 1-2 person-days
#   L  = 3-5 person-days
#   XL = 6-8 person-days
#
# Task numbering (Task <epic>.<n>) mapped to the backlog IDs (SD-xx):
#   Task 19.1 = SD-93  Commit pending work and organise the repository
#   Task 19.2 = SD-94  Licence, security policy and contribution files
#   Task 19.3 = SD-95  README restructure and architecture diagram
#   Task 19.4 = SD-96  Architecture decision records
#   Task 20.1 = SD-97  CI workflow: lint, typecheck, format, unit and integration tests
#   Task 20.2 = SD-98  Playwright E2E in CI
#   Task 20.3 = SD-99  Static analysis and secret scanning
#   Task 20.4 = SD-100  Dependency and supply-chain checks
#   Task 20.5 = SD-101  Container images and one-command demo stack
#   Task 20.6 = SD-102  DAST: OWASP ZAP baseline scan
#   Task 20.7 = SD-103  Release pipeline: signed images, provenance and Helm chart
#   Task 21.1 = SD-104  Decision record, Postgres infrastructure and Testcontainers harness
#   Task 21.2 = SD-105  Port the schema to Drizzle `pg-core` with a baseline migration
#   Task 21.3 = SD-106  Asynchronous data layer and service conversion
#   Task 21.4 = SD-107  Port protection logic: audit immutability, admin protection, chain locking, atomic counters
#   Task 21.5 = SD-108  Tests, E2E and CI on PostgreSQL
#   Task 21.6 = SD-109  SQLite to PostgreSQL data migration tool and cut-over runbook
#   Task 22.1 = SD-110  Redis client, configuration, health and failure policy
#   Task 22.2 = SD-111  Shared sliding-window rate limiter
#   Task 22.3 = SD-112  Shared CAPTCHA circuit breaker and replay markers
#   Task 22.4 = SD-113  Event bus abstraction on Redis pub/sub
#   Task 23.1 = SD-114  OpenAPI document generated from the Zod schemas, `/api/v1`
#   Task 23.2 = SD-115  API key model, issuance and revocation
#   Task 23.3 = SD-116  API key authentication stage and per-key limits
#   Task 23.4 = SD-117  Outbound signed webhooks
#   Task 23.5 = SD-118  Key and webhook management UI, generated client and integration docs
#   Task 24.1 = SD-119  Reverse proxy reference deployment and SPA security headers
#   Task 24.2 = SD-120  Audit ticket lifecycle events
#   Task 24.3 = SD-121  OpenTelemetry traces and Prometheus metrics
#   Task 24.4 = SD-122  OWASP ASVS mapping and gap analysis
#   Task 24.5 = SD-123  Module 4 verification, documentation and release
#   Task 25.1 = SD-124  Credential model, WebAuthn configuration and challenge store
#   Task 25.2 = SD-125  Registration ceremony
#   Task 25.3 = SD-126  Passkey authentication ceremony and session creation
#   Task 25.4 = SD-127  Step-up authentication and the multi-factor policy
#   Task 25.5 = SD-128  Passkey management UI and recovery codes
#   Task 25.6 = SD-129  Tests with a virtual authenticator, documentation and threat model
#   Task 26.1 = SD-130  OIDC client foundation and a local Keycloak realm
#   Task 26.2 = SD-131  Authorization Code flow with PKCE and ID token validation
#   Task 26.3 = SD-132  Account provisioning and linking policy
#   Task 26.4 = SD-133  Role mapping, session semantics and logout
#   Task 26.5 = SD-134  SSO UI, E2E against Keycloak and documentation
#   Task 27.1 = SD-135  Mail service with outbox, templates and Mailpit
#   Task 27.2 = SD-136  Verified email and self-service password reset
#   Task 27.3 = SD-137  Device sessions: list and revoke
#   Task 27.4 = SD-138  Security notifications and trusted devices
#   Task 27.5 = SD-139  Tests, timing checks and documentation for recovery and sessions
#   Task 28.1 = SD-140  GeoIP and network context service
#   Task 28.2 = SD-141  Login context history
#   Task 28.3 = SD-142  Risk engine
#   Task 28.4 = SD-143  Enforcement in the login pipeline
#   Task 28.5 = SD-144  Policy administration, explainability and the OIDC and MFA settings page
#   Task 28.6 = SD-145  Module 5 verification, E2E journey, documentation
#   Task 29.1 = SD-146  Security event enrichment pipeline
#   Task 29.2 = SD-147  IP reputation feeds and optional AbuseIPDB
#   Task 29.3 = SD-148  MITRE ATT&CK mapping for every rule and event type
#   Task 29.4 = SD-149  ATT&CK coverage page and Navigator layer export
#   Task 30.1 = SD-150  Incident data model, numbering and permissions
#   Task 30.2 = SD-151  Auditor role (read-only)
#   Task 30.3 = SD-152  Incident lifecycle API
#   Task 30.4 = SD-153  Incident UI with merged timeline
#   Task 30.5 = SD-154  Signed evidence bundle export
#   Task 30.6 = SD-155  Incident metrics, tests and documentation
#   Task 31.1 = SD-156  Playbook model, strict definition schema and permissions
#   Task 31.2 = SD-157  Action library with guard rails
#   Task 31.3 = SD-158  Execution engine with durable runs
#   Task 31.4 = SD-159  Approval workflow
#   Task 31.5 = SD-160  Playbook UI, run history and the historical simulator
#   Task 31.6 = SD-161  SOAR end-to-end tests, safeguards and documentation
#   Task 32.1 = SD-162  Merkle tree over the audit entries
#   Task 32.2 = SD-163  Signed checkpoints and key management
#   Task 32.3 = SD-164  Off-host witness publishers and an independent witness service
#   Task 32.4 = SD-165  Standalone verifier, proof API and UI
#   Task 32.5 = SD-166  Extended tamper demonstration and detection of full-chain rewrite
#   Task 32.6 = SD-167  Module 6 verification, documentation and portfolio write-up
#   Task 33.1 = SD-168  Comments, internal notes and the ticket activity feed (backend)
#   Task 33.2 = SD-169  Comments and activity UI
#   Task 33.3 = SD-170  Attachment model, file store abstraction and quotas
#   Task 33.4 = SD-171  Upload endpoint: streaming validation by content
#   Task 33.5 = SD-172  Malware scanning with ClamAV and the quarantine state machine
#   Task 33.6 = SD-173  Safe download and attachment UI
#   Task 34.1 = SD-174  Priority, category and the `WAITING` status
#   Task 34.2 = SD-175  SLA policies and business-hours calculation
#   Task 34.3 = SD-176  SLA timers, at-risk and breach detection
#   Task 34.4 = SD-177  Escalation rules
#   Task 34.5 = SD-178  SLA UI and administration pages
#   Task 35.1 = SD-179  Notification model, centre and preferences
#   Task 35.2 = SD-180  Domain events: transactional outbox and authorized fan-out
#   Task 35.3 = SD-181  Server-sent events endpoint
#   Task 35.4 = SD-182  Email notifications
#   Task 35.5 = SD-183  Angular real-time integration and the leak test
#   Task 36.1 = SD-184  Full-text search with row-level authorization
#   Task 36.2 = SD-185  Advanced filters and saved views
#   Task 36.3 = SD-186  Metrics dashboard
#   Task 36.4 = SD-187  Reports and exports (CSV and PDF)
#   Task 37.1 = SD-188  Personal data inventory and records of processing
#   Task 37.2 = SD-189  Subject access export
#   Task 37.3 = SD-190  Erasure through pseudonymisation and crypto-shredding of the audit log
#   Task 37.4 = SD-191  Retention policy engine
#   Task 37.5 = SD-192  Envelope encryption, key ring and rotation
#   Task 37.6 = SD-193  Attachment encryption at rest and the privacy UI
#   Task 37.7 = SD-194  Module 7 verification, final documentation and project release
# =============================================================================
set -euo pipefail
trap 'echo "Script failed at line $LINENO. Fix the cause and run again; existing issues are skipped." >&2' ERR

DRY_RUN="${SD_DRY_RUN:-0}"
ONLY_MODULE="${SD_ONLY_MODULE:-}"

if [ "$DRY_RUN" != "1" ]; then
  command -v gh >/dev/null 2>&1 || { echo "GitHub CLI (gh) is required: https://cli.github.com" >&2; exit 1; }
  gh auth status >/dev/null 2>&1 || { echo "Not authenticated. Run: gh auth login" >&2; exit 1; }
  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
else
  REPO="(dry run)"
fi
echo "Target repository: $REPO"
if [ "$DRY_RUN" != "1" ] && [ "${SD_ASSUME_YES:-0}" != "1" ]; then read -r -p "Create 19 labels, 4 milestones and up to 102 issues in $REPO? [y/N] " ANSWER; case "$ANSWER" in y|Y) ;; *) echo "Aborted."; exit 1 ;; esac; fi

# ---- helpers ----------------------------------------------------------------
create_label() { # name colour description
  if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] label: $1"; return; fi
  gh label create "$1" --color "$2" --description "$3" --force
}
EXISTING_MILESTONES=''
EXISTING_TITLES=''
if [ "$DRY_RUN" != "1" ]; then
  EXISTING_MILESTONES="$(gh api 'repos/:owner/:repo/milestones?state=all&per_page=100' --paginate --jq '.[].title')"
  EXISTING_TITLES="$(gh issue list --state all --limit 2000 --json title -q '.[].title')"
fi
create_milestone() { # title description
  if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] milestone: $1"; return; fi
  if grep -Fxq -- "$1" <<<"$EXISTING_MILESTONES"; then echo "milestone exists, skipped: $1"; return; fi
  gh api repos/:owner/:repo/milestones -f title="$1" -f state="open" -f description="$2" > /dev/null
}
CREATED=0; SKIPPED=0
create_issue() { # module title milestone labels body
  if [ -n "$ONLY_MODULE" ] && [ "$ONLY_MODULE" != "$1" ]; then return; fi
  if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] issue: $2  ($3; $4)"; CREATED=$((CREATED+1)); return; fi
  if grep -Fxq -- "$2" <<<"$EXISTING_TITLES"; then echo "issue exists, skipped: $2"; SKIPPED=$((SKIPPED+1)); return; fi
  gh issue create --title "$2" --milestone "$3" --label "$4" --body "$5"
  CREATED=$((CREATED+1))
  sleep 3
}

# =============================================================================
# STEP 1 - Labels (new epic labels; priorities and technical labels already exist)
# =============================================================================
echo "STEP 1/3: creating labels..."
create_label 'epic:repo-foundation' '#4c566a' 'Epic 19: Repository Foundation'
create_label 'epic:devsecops' '#d29922' 'Epic 20: CI and DevSecOps Pipeline'
create_label 'epic:postgres' '#336791' 'Epic 21: PostgreSQL Migration'
create_label 'epic:redis' '#c0392b' 'Epic 22: Redis Shared State'
create_label 'epic:public-api' '#0e8a16' 'Epic 23: Public API and API Keys'
create_label 'epic:prod-hardening' '#6f42c1' 'Epic 24: Production Hardening'
create_label 'epic:passkeys' '#0b7285' 'Epic 25: Passkeys and WebAuthn'
create_label 'epic:oidc-sso' '#5319e7' 'Epic 26: OIDC Single Sign-On'
create_label 'epic:recovery-sessions' '#e36209' 'Epic 27: Recovery and Device Sessions'
create_label 'epic:adaptive-auth' '#bf3989' 'Epic 28: Adaptive Authentication'
create_label 'epic:threat-intel' '#8b5a2b' 'Epic 29: Threat Intelligence and ATT&CK'
create_label 'epic:incidents' '#b60205' 'Epic 30: Incident Case Management'
create_label 'epic:soar' '#1a7f37' 'Epic 31: SOAR-lite Playbooks'
create_label 'epic:merkle-audit' '#8250df' 'Epic 32: Merkle Audit Log and Witness'
create_label 'epic:comments-attachments' '#0969da' 'Epic 33: Comments and Attachments'
create_label 'epic:sla' '#fbca04' 'Epic 34: SLA, Priorities and Categories'
create_label 'epic:realtime' '#2da44e' 'Epic 35: Real-time and Notifications'
create_label 'epic:search-reports' '#5a6b8c' 'Epic 36: Search and Reports'
create_label 'epic:privacy' '#a2eeef' 'Epic 37: GDPR and Data Protection Toolkit'

# =============================================================================
# STEP 2 - Milestones (one per module; epics are labels)
# =============================================================================
echo "STEP 2/3: creating milestones..."
create_milestone 'Module 4: Foundation and Platform' 'Repository foundation, CI and DevSecOps, PostgreSQL and Redis, public API, production hardening.'
create_milestone 'Module 5: Identity' 'Passkeys, OIDC single sign-on, recovery and device sessions, adaptive authentication.'
create_milestone 'Module 6: Detection and Response' 'Threat intelligence and ATT&CK, incident cases, SOAR-lite playbooks, Merkle audit log with a witness.'
create_milestone 'Module 7: Helpdesk and Data Protection' 'Comments and attachments, SLAs, real-time updates, search and reports, GDPR toolkit.'

# =============================================================================
# STEP 3 - Issues (one per task)
# =============================================================================
echo "STEP 3/3: creating issues..."

# ---- Epic 19: Repository Foundation ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

The public history ends at the audit-verify commit while Modules 2 and 3 (detection rules, Loki shipping, webhooks, observability, reports, evidence) exist only as uncommitted files. Land them as reviewable commits, and move coursework artefacts out of the root so the repository tells a clean story.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Split the working tree into logical conventional commits (schema and migrations, backend services, routes, frontend, tests, docs, evidence). Run `npm run lint && npm run typecheck && npm test` before pushing the series; no commit leaves the tree red where avoidable.
- Move `create_issues_module_3.sh` and later issue scripts to `scripts/issues/`; move `docs/backlog*.md`, `docs/report*.md` and the Polish reports to `docs/course/`; update every relative link (README, docs, `check-image-locations.ts`).
- Add `output/` to `.gitignore` except a documented `output/.gitkeep`; remove `output/pdf/SecureDesk-raport.pdf` from tracking (attach it to a release instead). Never track the course assignment PDF (`Cyberbezpieczenstwo_3.pdf`); add it to `.gitignore` explicitly.
- Delete `scripts/__pycache__/`, `tmp/`, and add them to `.gitignore`. Decide whether `AGENTS.md` and `CLAUDE.md` stay public and commit or ignore them.
- Check that `git ls-files` contains no secret, database, credential file or personal data (`.env`, `*.sqlite*`, `initial-credentials.txt`).

📚 Source: backlog SD-93 (Epic 19) · provenance [FOUNDATION] · priority P0

📏 Estimated size of issue: M (1-2 person-days, Docs, DevOps)

### ✅ Acceptance Criteria

- [ ] `git status` is clean on `main` after merge; `git log` shows the Module 2 and 3 work as separate conventional commits.
- [ ] Repository root contains only configuration, `apps/`, `docs/`, `scripts/`, `tests/`, `observability/` and top-level project files.
- [ ] `npm run check:image-locations`, `npm run format:check`, `npm test` pass after the moves; no broken relative links (checked with a link checker in SD-97).
- [ ] No assignment PDF or generated report is tracked.
- [ ] Minimum 80% test coverage for this module (no new code; gate stays green).

### 🔗 Dependencies

none
SDISSUE_EOF
create_issue 4 '[Task 19.1] Commit pending work and organise the repository' 'Module 4: Foundation and Platform' 'documentation,devops,high-priority,epic:repo-foundation' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Give strangers the legal and procedural basics: what they may do with the code, how to report a vulnerability, how to contribute.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `LICENSE` (MIT) with the author's name and year; `package.json` `license` fields.
- `SECURITY.md`: supported versions, private reporting through GitHub Security Advisories, expected response times, scope (the app, not third-party services), safe-harbour wording.
- `CONTRIBUTING.md`: setup, branch and commit conventions (conventional commits already in use), how to run the checks, how to add a SEC test (traceability rule), Definition of Done link.
- `.github/ISSUE_TEMPLATE/` (bug, feature, security-hardening), `PULL_REQUEST_TEMPLATE.md` with the DoD checklist, `CODEOWNERS`.
- Document, as a manual step in `docs/repo-settings.md`, the GitHub repository settings to apply: description, topics (`cybersecurity`, `rbac`, `audit-log`, `angular`, `nextjs`, `owasp`, `siem`), branch protection with required status checks, secret scanning and push protection, private vulnerability reporting.

📚 Source: backlog SD-94 (Epic 19) · provenance [FOUNDATION] · priority P0

📏 Estimated size of issue: S (up to 1 person-day, Docs, DevOps)

### ✅ Acceptance Criteria

- [ ] `gh repo view` shows a detected licence after merge; the Security tab shows the policy.
- [ ] Issue and PR templates appear in the GitHub UI.
- [ ] `docs/repo-settings.md` lists every setting with the exact toggle name.
- [ ] Minimum 80% test coverage for this module (documentation task).

### 🔗 Dependencies

Task 19.1 (SD-93)
SDISSUE_EOF
create_issue 4 '[Task 19.2] Licence, security policy and contribution files' 'Module 4: Foundation and Platform' 'documentation,devops,high-priority,epic:repo-foundation' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

The current README (about 25 KB) opens with a tutorial. A reviewer decides in a minute. Lead with the pitch, evidence and a diagram; move reproduction steps into `docs/`.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Top section: one-paragraph pitch, badges (CI, coverage, licence, last release), a short feature list grouped by area, a 3-line quick start (after SD-102 `docker compose up`), the demo preview and recording link.
- A "Security controls at a glance" table: control, where implemented, test IDs (generated from `docs/testing.md` by a small script to avoid drift).
- Replace the placeholder architecture note ("Diagram derived from the SD-01 task description…") with a Mermaid diagram of the topology in section 2.1 and a second one for the login pipeline; fix the stale "tests/ (added in later tasks)" layout line.
- Move "Reproduce the Module 2 / Module 3 demonstration", report building, and database commands to `docs/running.md`, `docs/demos.md`; keep links.
- Keep the honest "not production-certified" statement once, in a "Status and limitations" section.

📚 Source: backlog SD-95 (Epic 19) · provenance [PORTFOLIO] [FOUNDATION] · priority P0

📏 Estimated size of issue: M (1-2 person-days, Docs)

### ✅ Acceptance Criteria

- [ ] README is under 200 lines and renders both Mermaid diagrams on GitHub.
- [ ] All links resolve (link checker in CI); the quick start works from a clean clone.
- [ ] Every claim in the README is backed by a link to code or a test ID.
- [ ] Minimum 80% test coverage for this module (documentation task).

### 🔗 Dependencies

Task 19.1 (SD-93)
SDISSUE_EOF
create_issue 4 '[Task 19.3] README restructure and architecture diagram' 'Module 4: Foundation and Platform' 'documentation,high-priority,epic:repo-foundation' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Record why the system is the way it is. ADRs are a cheap, strong signal of engineering maturity and give interviewers specific things to discuss.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `docs/adr/0000-template.md` (MADR format) and an index `docs/adr/README.md`.
- Retroactive ADRs: split Angular SPA and Next.js API; server-side revocable cookie sessions over JWT; Argon2id parameters; CSRF with Origin check plus HMAC double submit; SHA-256 chain with head anchor; process-local limiter (superseded later); SQLite choice (superseded by SD-104).
- New ADRs written while building this module: PostgreSQL only with Testcontainers; Redis fail-closed policy; API keys limited to ticket scopes; webhook SSRF policy.
- Link ADRs from the README and from the relevant backlog tasks.

📚 Source: backlog SD-96 (Epic 19) · provenance [PORTFOLIO] [FOUNDATION] · priority P1

📏 Estimated size of issue: S (up to 1 person-day, Docs)

### ✅ Acceptance Criteria

- [ ] At least eight ADRs with status, context, decision, consequences; superseded ones point to their successors.
- [ ] A markdown lint step (SD-97) validates the ADR front matter.
- [ ] Minimum 80% test coverage for this module (documentation task).

### 🔗 Dependencies

Task 19.1 (SD-93)
SDISSUE_EOF
create_issue 4 '[Task 19.4] Architecture decision records' 'Module 4: Foundation and Platform' 'documentation,medium-priority,epic:repo-foundation' "$BODY"

# ---- Epic 20: CI and DevSecOps Pipeline ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Every push and pull request runs the same checks as `npm test` locally, and `main` is protected by them.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `.github/workflows/ci.yml`: Node from `.nvmrc`, `npm ci` with cache, jobs `lint`, `typecheck`, `format`, `test` (runs `npm test` including the SEC traceability and image checks and the coverage gate), `links` (lychee over README and docs), `adr-lint`.
- Upload the coverage report as an artifact and publish a coverage badge (shields endpoint through a gist, or the Actions summary).
- Pin third-party actions by commit SHA; set `permissions: contents: read` at the top and widen per job only when needed; concurrency group cancels superseded runs.
- Add a status badge to the README; configure the required checks in `docs/repo-settings.md`.
- After SD-108 the `test` job gains a PostgreSQL service container; until then it runs on SQLite.

📚 Source: backlog SD-97 (Epic 20) · provenance [FOUNDATION] · priority P0

📏 Estimated size of issue: M (1-2 person-days, DevOps, QA)

### ✅ Acceptance Criteria

- [ ] A pull request that breaks a test, a lint rule, formatting or coverage fails the workflow and cannot be merged.
- [ ] A fresh run completes in under 10 minutes with a warm cache.
- [ ] Every action reference is a full SHA with a version comment; workflow token permissions are least-privilege.
- [ ] Minimum 80% test coverage for this module (pipeline task; coverage gate itself is the verification).

### 🔗 Dependencies

Task 19.1 (SD-93)
SDISSUE_EOF
create_issue 4 '[Task 20.1] CI workflow: lint, typecheck, format, unit and integration tests' 'Module 4: Foundation and Platform' 'devops,testing,high-priority,epic:devsecops' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Run the browser journeys of Modules 1 to 3 on every pull request, with artifacts that make failures diagnosable.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Job `e2e` installing Chromium via `npx playwright install --with-deps chromium`, running `npm run test:e2e:module2` and `npm run test:e2e:module3` with zero retries as the scripts already require; the `@slow` idle-timeout spec runs on `main` and nightly only.
- Upload Playwright HTML report, traces and videos on failure; keep 14 days.
- Shard the suite when it exceeds 8 minutes; keep the test database per shard isolated (`E2E_DATABASE_PATH` per shard until SD-108, a database per shard afterwards).
- Cache the Playwright browser directory keyed by version.

📚 Source: backlog SD-98 (Epic 20) · provenance [FOUNDATION] · priority P0

📏 Estimated size of issue: M (1-2 person-days, DevOps, QA)

### ✅ Acceptance Criteria

- [ ] The E2E job is a required check on `main`.
- [ ] A deliberately failing spec uploads a trace that opens locally.
- [ ] Two consecutive runs on the same commit give the same result (no flakiness introduced by CI timing).
- [ ] Minimum 80% test coverage for this module (pipeline task).

### 🔗 Dependencies

Task 20.1 (SD-97)
SDISSUE_EOF
create_issue 4 '[Task 20.2] Playwright E2E in CI' 'Module 4: Foundation and Platform' 'devops,testing,high-priority,epic:devsecops' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Catch vulnerable code patterns and committed secrets automatically.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `.github/workflows/codeql.yml`: CodeQL for `javascript-typescript`, on pull requests, pushes to `main` and weekly; query suite `security-extended`.
- gitleaks: a workflow scanning the full history on `main` and the diff on pull requests, plus `.gitleaks.toml` with an allowlist for documented placeholder values in `.env.example` and test fixtures (each entry commented). Provide an optional local pre-commit hook script.
- Add `eslint-plugin-security` (or equivalent flat-config rules) for `detect-child-process`, `detect-non-literal-fs-filename`, `detect-unsafe-regex`; justify any disabled rule inline.
- Triage first findings: fix, or suppress with a written reason in `docs/security-triage.md`.

📚 Source: backlog SD-99 (Epic 20) · provenance [HARDENING] [STANDARD] · priority P0

📏 Estimated size of issue: M (1-2 person-days, DevOps)

### ✅ Acceptance Criteria

- [ ] CodeQL results appear in the Security tab; no open high or critical alert without a triage entry.
- [ ] A test commit containing a fake AWS key (outside the allowlist) fails the gitleaks job (demonstrated once, evidence in the PR).
- [ ] `npm run lint` includes the security rules and passes.
- [ ] Minimum 80% test coverage for this module (pipeline task).

### 🔗 Dependencies

Task 20.1 (SD-97)
SDISSUE_EOF
create_issue 4 '[Task 20.3] Static analysis and secret scanning' 'Module 4: Foundation and Platform' 'devops,security,high-priority,epic:devsecops' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Know what is in the build, and fail when a known-vulnerable dependency enters.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `.github/dependabot.yml`: npm (grouped minor and patch updates, weekly), GitHub Actions, and Docker (after SD-101).
- CI step `npm audit --omit=dev --audit-level=high` with an allowlist file `audit-allowlist.json` whose entries need an advisory ID, reason and expiry date; a script fails when an entry expires.
- OSV-Scanner over `package-lock.json`.
- Generate a CycloneDX SBOM (`@cyclonedx/cyclonedx-npm`) per release and as a CI artifact; verify with a schema validator.
- Lockfile hygiene check: `npm ci` fails on drift; a script rejects `resolutions` of unexpected registries and install scripts of new dependencies (list allowed ones).

📚 Source: backlog SD-100 (Epic 20) · provenance [HARDENING] [STANDARD] · priority P0

📏 Estimated size of issue: M (1-2 person-days, DevOps)

### ✅ Acceptance Criteria

- [ ] Dependabot opens grouped pull requests; CI runs on them.
- [ ] Adding a dependency with a known high advisory fails the job (demonstrated once).
- [ ] An SBOM artifact is produced for every `main` build and validates against the CycloneDX schema.
- [ ] Minimum 80% test coverage for this module (pipeline task; the allowlist expiry script is unit tested).

### 🔗 Dependencies

Task 20.1 (SD-97)
SDISSUE_EOF
create_issue 4 '[Task 20.4] Dependency and supply-chain checks' 'Module 4: Foundation and Platform' 'devops,security,high-priority,epic:devsecops' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Anyone can run the whole system with `docker compose up`, using hardened images.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `apps/backend/Dockerfile`: multi-stage, `node:24-slim`, `npm ci --omit=dev` for the runtime stage, Next.js standalone output, native modules (`argon2`) built in the build stage, non-root user, read-only root filesystem with explicit writable volumes (`/data/audit`, `/data/alerts`), `HEALTHCHECK` on `/api/health`.
- `apps/frontend/Dockerfile`: build stage then Caddy serving the static files (reused by SD-119).
- `docker-compose.yml` for the full stack: `postgres`, `redis`, `migrate` (one-shot, migrator role), `seed` (demo accounts, passwords written to a mounted volume, never the log), `backend`, `frontend`, optional profiles `observability` (existing Loki and Grafana), `idp` (Keycloak, Module 5), `mail` (Mailpit), `av` (ClamAV, Module 7).
- Image scan with Trivy in CI (fail on high or critical with a fixable version); also scan the Dockerfile with hadolint.
- Document secrets handling: compose reads from an untracked `.env.compose`; no secret baked into an image layer (verified with `docker history`).

📚 Source: backlog SD-101 (Epic 20) · provenance [FOUNDATION] [HARDENING] · priority P0

📏 Estimated size of issue: L (3-5 person-days, DevOps)

### ✅ Acceptance Criteria

- [ ] `docker compose up --build` from a clean clone produces a working app at `https://localhost` (or `http://localhost:8080` without TLS profile) with seeded demo data.
- [ ] Containers run as non-root with `read_only: true` and `cap_drop: [ALL]` (SEC-118 smoke test).
- [ ] Trivy and hadolint pass in CI.
- [ ] Image size of the backend runtime is documented and below 400 MB.
- [ ] Minimum 80% test coverage for this module (infrastructure task; smoke script in CI).

### 🔗 Dependencies

Task 20.1 (SD-97), Task 21.1 (SD-104)
SDISSUE_EOF
create_issue 4 '[Task 20.5] Container images and one-command demo stack' 'Module 4: Foundation and Platform' 'devops,high-priority,epic:devsecops' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Run a dynamic scan against the composed stack and publish the report as evidence.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Workflow job that starts the compose stack with the E2E fixture accounts, runs `zaproxy` baseline scan on the SPA and an API scan against `/api/v1/openapi.json` (after SD-114; baseline only before that).
- ZAP context with authenticated session script for one Guest and one Manager (logins from the CI-generated fixtures; no real credentials).
- Fail on new high alerts; keep an `zap-rules.tsv` of accepted alerts with a reason.
- Upload the HTML report as an artifact and link the latest one from `docs/security-evidence/`.

📚 Source: backlog SD-102 (Epic 20) · provenance [HARDENING] [STANDARD] · priority P1

📏 Estimated size of issue: M (1-2 person-days, DevOps)

### ✅ Acceptance Criteria

- [ ] A scan runs on `main` weekly and on demand; the report is downloadable.
- [ ] No high alert is open without an entry in `zap-rules.tsv`.
- [ ] The scan never targets anything but the compose stack of the job (host allowlist in the script).
- [ ] Minimum 80% test coverage for this module (pipeline task).

### 🔗 Dependencies

Task 20.5 (SD-101)
SDISSUE_EOF
create_issue 4 '[Task 20.6] DAST: OWASP ZAP baseline scan' 'Module 4: Foundation and Platform' 'devops,security,medium-priority,epic:devsecops' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

A tagged release produces verifiable artifacts: signed images, an SBOM attached to them, SLSA provenance, a Helm chart, and release notes.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Workflow on tag `v*`: build and push images to GHCR, sign with cosign keyless (GitHub OIDC), attach the CycloneDX SBOM as an attestation, generate SLSA provenance (`slsa-github-generator`), create a GitHub Release with notes from conventional commits and attach the audit report PDF.
- `deploy/helm/securedesk/`: Deployments for backend and frontend, Service, Ingress, `ConfigMap` for non-secret settings, secrets referenced from an existing `Secret` (no secrets in values), liveness and readiness probes, `securityContext` (non-root, read-only root FS, drop all capabilities), `NetworkPolicy` (frontend to backend to Postgres and Redis only), `PodDisruptionBudget`.
- CI: `helm lint`, `kubeconform` against the Kubernetes schema, and a `kind` smoke job installing the chart with bundled Postgres and Redis subcharts.
- `docs/release.md`: how to verify a signature (`cosign verify`) and provenance (`slsa-verifier`).

📚 Source: backlog SD-103 (Epic 20) · provenance [STANDARD] [PORTFOLIO] · priority P1

📏 Estimated size of issue: L (3-5 person-days, DevOps)

### ✅ Acceptance Criteria

- [ ] Tagging `v0.2.0` on a fork produces a signed image that `cosign verify` accepts with the documented identity.
- [ ] `helm install` on `kind` brings the app to ready and `curl /api/health` returns `200`.
- [ ] `kubeconform` and `helm lint` pass; the chart contains no plaintext secret.
- [ ] Minimum 80% test coverage for this module (pipeline task).

### 🔗 Dependencies

Task 20.5 (SD-101)
SDISSUE_EOF
create_issue 4 '[Task 20.7] Release pipeline: signed images, provenance and Helm chart' 'Module 4: Foundation and Platform' 'devops,security,medium-priority,epic:devsecops' "$BODY"

# ---- Epic 21: PostgreSQL Migration ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Make Postgres available for development, tests and CI before any code is ported, and record the decision (PostgreSQL only; SQLite is dropped, D4-01).

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- ADR `0010-postgresql-only.md` with the trade-offs: lost zero-setup demo, replaced by `docker compose up`; single dialect keeps one migration history and one trigger implementation.
- Compose service `postgres:17` with a named volume, healthcheck, and an init script creating the roles `securedesk_migrator` and `securedesk_app` with separate passwords.
- Dev scripts: `npm run db:up`, `db:down`, `db:psql`.
- Test harness `tests/support/postgres.ts` based on `@testcontainers/postgresql`: one container per Vitest run (global setup), a template database migrated once, and a fresh database cloned from the template per test file (`CREATE DATABASE … TEMPLATE`), dropped afterwards.
- Config module reading `DATABASE_URL` and `DATABASE_MIGRATOR_URL`, validated at start-up; production refuses a superuser or a migrator URL for the app.

📚 Source: backlog SD-104 (Epic 21) · provenance [DESIGN] [FOUNDATION] · priority P0

📏 Estimated size of issue: M (1-2 person-days, DB, DevOps)

### ✅ Acceptance Criteria

- [ ] `npm run db:up` starts Postgres; the two roles exist with the documented privileges.
- [ ] A sample Vitest file obtains an isolated, migrated database in under 2 seconds after the template exists.
- [ ] Start-up refuses a missing `DATABASE_URL`, and in production refuses a URL whose role can create tables.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 19.4 (SD-96), Task 20.1 (SD-97)
SDISSUE_EOF
create_issue 4 '[Task 21.1] Decision record, Postgres infrastructure and Testcontainers harness' 'Module 4: Foundation and Platform' 'database,devops,high-priority,epic:postgres' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Express every table in `apps/backend/src/server/db/schema/` for Postgres with proper types and constraints, and create a clean baseline migration.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Convert each schema file: `integer(mode: timestamp_ms)` to `timestamp(…, { withTimezone: true, mode: 'date' })`; `integer(mode: boolean)` to `boolean`; text IDs that are UUIDs to `uuid`; `AUTOINCREMENT` audit `seq` to `bigint generated always as identity`; JSON-in-text columns to `jsonb` where the code already stores JSON; CHECK constraints preserved; enum-like checks may become `CHECK` on `text` (keep the closed-list behaviour, no native enums, so adding a value is a simple migration).
- Case-insensitive uniqueness of `login_normalized` stays a plain unique index on the normalised value (no `citext`).
- Freeze the old migrations to `migrations-sqlite-legacy/`; generate `0000_pg_baseline` with `drizzle-kit` and review the SQL by hand.
- Update `docs/database-schema.md` and `.mmd`, and the ER-diagram test (`er-diagram.test.ts`) to the new types.
- Add schema tests: every FK has an index where queried; every `timestamptz` column is `NOT NULL` unless documented.

📚 Source: backlog SD-105 (Epic 21) · provenance [DESIGN] · priority P0

📏 Estimated size of issue: L (3-5 person-days, DB)

### ✅ Acceptance Criteria

- [ ] The baseline migration applies to an empty Postgres and produces a schema equivalent to the SQLite one (table and column list compared by a script).
- [ ] The ER diagram and `docs/database-schema.md` match the schema (test green).
- [ ] No column of the old schema is silently dropped (the comparison script lists every difference with a reason).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 21.1 (SD-104)
SDISSUE_EOF
create_issue 4 '[Task 21.2] Port the schema to Drizzle `pg-core` with a baseline migration' 'Module 4: Foundation and Platform' 'database,high-priority,epic:postgres' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Replace `better-sqlite3`, whose synchronous transactions the code relies on (for example "no `await` between the read and the insert" in `audit/append.ts`), with an async `pg` pool, and convert every caller.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `db/connection.ts` and `db/client.ts`: `pg.Pool` with sensible limits (`max`, `idleTimeoutMillis`, `statement_timeout`), `drizzle-orm/node-postgres`, graceful shutdown in `instrumentation.ts`.
- Convert, in this order: `permissions`, `users`, `auth` (login, password, session, TOTP services), `security` (settings, events, attempt tracker, IP blocks, honeytokens), `tickets`, `audit`, `detection`, `maintenance`, route handlers, `defineRoute`, seeds, CLI scripts (`audit-verify`, `audit-tamper-demo`, `purge`, `admin-unlock`).
- Keep the transaction-handle convention: services accept `tx` so the audit entry and the change commit together; add an `await`-safe `withTransaction(db, fn)` helper that retries on serialization failures (`40001`) and deadlocks (`40P01`) up to three times.
- Replace SQLite-specific SQL (`INSERT OR IGNORE`, `RAISE(ABORT)`, `PRAGMA`, `sqlite_sequence`, `json_extract`) with Postgres equivalents (`ON CONFLICT`, `jsonb` operators). Update `security/sql-lint.test.ts` so the lint rule still rejects `sql.raw` and interpolated SQL outside migrations.
- Remove `better-sqlite3` and `@types/better-sqlite3`; remove `DATABASE_PATH`, `TEST_DATABASE_PATH`, `E2E_DATABASE_PATH` from `.env.example` and the docs.

📚 Source: backlog SD-106 (Epic 21) · provenance [DESIGN] · priority P0

📏 Estimated size of issue: XL (6-8 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] `grep -r "better-sqlite3" apps scripts tests` returns nothing; `npm run typecheck` is green.
- [ ] Every previously passing unit and integration test passes unchanged in intent (assertions may change only where SQLite semantics differed, each listed in the PR).
- [ ] A `withTransaction` test proves retry on `40001` and `40P01` and no retry on constraint violations.
- [ ] The SQL lint rule still fails on `sql.raw` and string-interpolated SQL.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 21.2 (SD-105)
SDISSUE_EOF
create_issue 4 '[Task 21.3] Asynchronous data layer and service conversion' 'Module 4: Foundation and Platform' 'backend,database,high-priority,epic:postgres' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Re-establish, on Postgres, every guarantee that SQLite triggers and single-process synchronous transactions gave implicitly.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration with `audit_log` triggers (`BEFORE UPDATE OR DELETE` and `BEFORE TRUNCATE`, PL/pgSQL `RAISE EXCEPTION 'audit_log is append-only'`) **and** privilege revocation: `securedesk_app` has `INSERT, SELECT` only on `audit_log`; `ALTER TABLE … OWNER` stays with the migrator.
- Port the protected-ADMIN triggers of `0001_protect_admin_account.sql` (no block, delete or role change) to PL/pgSQL.
- Audit append: serialise writers with a one-row `audit_head` table locked `FOR UPDATE`, or `pg_advisory_xact_lock(hashtext('audit_log'))` (decide by benchmark, record in an ADR); read the last `(seq, entry_hash)`, insert, update head, all in the caller's transaction. Keep the canonical format `sd-audit-v1` byte-for-byte so existing chains verify.
- Head anchor advancement: only after commit (`afterCommit` hook on the transaction wrapper), never inside the transaction.
- Atomic counters: the "Nth failure locks the account" decision uses a single `UPDATE … SET failures = failures + 1 … RETURNING` plus a conditional lock, so 50 parallel attempts admit at most five credential checks across two app processes (SEC-101).
- Session revocation transactions keep `READ COMMITTED` semantics with explicit row locks where the code assumed single-writer behaviour; add a short note per place.

📚 Source: backlog SD-107 (Epic 21) · provenance [HARDENING] · priority P0

📏 Estimated size of issue: L (3-5 person-days, DB)

### ✅ Acceptance Criteria

- [ ] `UPDATE`, `DELETE` and `TRUNCATE` on `audit_log` fail for the app role with a privilege error and for the migrator with the trigger message (SEC-97, SEC-98).
- [ ] Block, delete and role change of `ADMIN` still fail at the database level (SEC-99).
- [ ] 50 concurrent appends from two pooled connections produce a gapless `seq` and a valid chain (SEC-100).
- [ ] 50 parallel wrong-password logins from two processes admit at most five credential checks (SEC-101).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 21.3 (SD-106)
SDISSUE_EOF
create_issue 4 '[Task 21.4] Port protection logic: audit immutability, admin protection, chain locking, atomic counters' 'Module 4: Foundation and Platform' 'database,security,high-priority,epic:postgres' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

The whole suite runs on Postgres locally and in CI, with isolation that keeps it fast.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Vitest global setup starts one Testcontainers instance (or uses the CI service container when `DATABASE_TEST_URL` is set) and exposes the template-database helper to every test file; update `vitest.config.ts`, fixtures under `server/__fixtures__`, and the fake-clock helpers.
- Playwright `global-setup` and `setup-db.ts`: create a database per run (and per shard), migrate with the migrator role, seed, write `tests/e2e/.credentials.json` as before; `scripts/test-module3-e2e.mjs` creates and drops its temporary database.
- Persistence tests that "reopen the database" (SEC-30, SEC-59) become "restart the pool" tests.
- CI job `test` gains a `postgres:17` service; `e2e` jobs use the same.
- Update `docs/testing.md`, README and `docs/running.md`.

📚 Source: backlog SD-108 (Epic 21) · provenance [FOUNDATION] · priority P0

📏 Estimated size of issue: L (3-5 person-days, QA, DevOps)

### ✅ Acceptance Criteria

- [ ] `npm test` and `npm run test:e2e` pass locally with only Docker installed; the run leaves no stray databases or containers.
- [ ] Test duration on CI is no more than 1.5 times the SQLite baseline.
- [ ] SEC-01 to SEC-96 still map to real test titles (traceability check green).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 21.4 (SD-107), Task 20.2 (SD-98)
SDISSUE_EOF
create_issue 4 '[Task 21.5] Tests, E2E and CI on PostgreSQL' 'Module 4: Foundation and Platform' 'testing,devops,high-priority,epic:postgres' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Existing development and demo data (and the audit chain) survive the switch, and the process is a documented, repeatable runbook.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `apps/backend/scripts/migrate-sqlite-to-pg.ts` (`npm run db:import:sqlite -- <path>`): opens the legacy file read-only with a throwaway `better-sqlite3` import (kept only in this script's dev dependency), copies tables in FK order inside one transaction, converts types, **preserves `seq` and every hash byte-for-byte**, and resets the identity sequence.
- After the copy: run the full chain verification and compare row counts per table; print a report and exit non-zero on any difference.
- Refuses a non-empty target. Writes one `SYSTEM` audit entry `DATA_IMPORTED` only **after** verification passes (new catalogue event).
- `docs/migration-sqlite-to-postgres.md`: backup first, stop the app, run, verify, rollback by restoring the file.

📚 Source: backlog SD-109 (Epic 21) · provenance [DESIGN] · priority P1

📏 Estimated size of issue: M (1-2 person-days, DB, Docs)

### ✅ Acceptance Criteria

- [ ] Importing the demo database yields identical row counts and `INTACT` verification (SEC-105).
- [ ] Importing a database with a tampered audit row fails with the sequence number named, and nothing is committed.
- [ ] The tool refuses to run against a non-empty target database.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 21.4 (SD-107)
SDISSUE_EOF
create_issue 4 '[Task 21.6] SQLite to PostgreSQL data migration tool and cut-over runbook' 'Module 4: Foundation and Platform' 'database,documentation,medium-priority,epic:postgres' "$BODY"

# ---- Epic 22: Redis Shared State ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

One audited way to talk to Redis, with a defined behaviour when it is unavailable.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `server/shared-state/redis.ts` using `ioredis`: single client per process, connection and command timeouts, no unbounded offline queue, TLS option, reconnect with capped backoff.
- `/api/health` reports `postgres` and `redis` separately (still `200` only if both are up for readiness; a new `/api/health/live` is liveness only).
- Failure policy implemented as a function `sharedStatePolicy(feature)`: `failClosed` for login, password change, TOTP and reset limiters; `failOpenLogged` for non-security caches. The decision table lives in the ADR (D4-04).
- Redis compose service (`redis:8-alpine`, no persistence needed for limiter state, `requirepass`).

📚 Source: backlog SD-110 (Epic 22) · provenance [DESIGN] · priority P0

📏 Estimated size of issue: S (up to 1 person-day, BE, DevOps)

### ✅ Acceptance Criteria

- [ ] With Redis stopped, a login request returns `503 SERVICE_UNAVAILABLE` before verifying credentials (SEC-103) and the health endpoint reports the failing dependency.
- [ ] Commands never hang longer than the configured timeout.
- [ ] `.env.example`, compose and docs list `REDIS_URL`.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 21.1 (SD-104)
SDISSUE_EOF
create_issue 4 '[Task 22.1] Redis client, configuration, health and failure policy' 'Module 4: Foundation and Platform' 'backend,devops,high-priority,epic:redis' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Replace the process-local `SlidingWindowRateLimiter` so limits hold across instances and restarts.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Introduce `interface RateLimitStore { consume; check; record; clear }` (async). Keep the current class as `InMemoryRateLimitStore` for unit tests; add `RedisRateLimitStore` using a sorted set per key and a Lua script so check-and-record is atomic (SEC-36 semantics).
- Key naming: `rl:{purpose}:{ip-bucket-or-login-hash}`; never store raw logins (use the existing keyed hash); TTL equals the window.
- Update all call sites (`attempt-tracker`, `login-guard`, `ip-block-service`, honeytoken and webhook routes) to `await`.
- Time comes from the Redis server clock inside the Lua script (`TIME`) in production and from the injected clock in tests via a parameter, so fake-clock tests still work.
- Document the migration of Module 1 and 2 behaviour (SEC-27, SEC-36, SEC-55 to SEC-57) in `docs/architecture.md`.

📚 Source: backlog SD-111 (Epic 22) · provenance [HARDENING] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] The sixth failed login is throttled identically for known and unknown logins when requests alternate between two backend processes (SEC-102).
- [ ] A 50-request parallel burst across two processes admits at most five credential checks (SEC-101).
- [ ] Restarting the backend does not reset limits (state lives in Redis).
- [ ] No raw login or IP appears in a Redis key (checked by scanning keys in a test).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 22.1 (SD-110), Task 21.3 (SD-106)
SDISSUE_EOF
create_issue 4 '[Task 22.2] Shared sliding-window rate limiter' 'Module 4: Foundation and Platform' 'backend,security,high-priority,epic:redis' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

The README lists the "process-local CAPTCHA circuit breaker" as a documented limitation. Remove it, and decide where each replay marker authoritatively lives.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Breaker state (consecutive Turnstile failures, open-until) in Redis with atomic Lua updates; fallback mode semantics of `CAPTCHA_FALLBACK=internal` unchanged.
- One-time CAPTCHA challenge consumption stays in the database (authoritative, transactional); a Redis short-TTL "seen token" set is added only as a fast-path cache for Turnstile token replay.
- TOTP accepted-step marker (`users.totp_last_used_step`) stays in the database; add a regression test that two instances cannot both accept the same code.
- Update `docs/architecture.md`, the threat model and the README "Current status".

📚 Source: backlog SD-112 (Epic 22) · provenance [HARDENING] · priority P1

📏 Estimated size of issue: M (1-2 person-days, BE)

### ✅ Acceptance Criteria

- [ ] After five Turnstile failures observed by instance A, instance B serves the fallback (or fails closed) without its own five failures (SEC-104).
- [ ] The same TOTP code submitted concurrently to two instances is accepted once.
- [ ] A replayed Turnstile token is refused even when it reaches a different instance.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 22.2 (SD-111)
SDISSUE_EOF
create_issue 4 '[Task 22.3] Shared CAPTCHA circuit breaker and replay markers' 'Module 4: Foundation and Platform' 'backend,security,medium-priority,epic:redis' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Provide the publish and subscribe primitive that Modules 6 and 7 need (SOAR triggers, real-time stream) without committing them to Redis directly.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `server/shared-state/event-bus.ts`: `interface EventBus { publish(topic, event); subscribe(topic, handler): Unsubscribe }`; Redis implementation on `PUBLISH` with a dedicated subscriber connection; in-process implementation for tests.
- Event envelope: `{ id (uuid v7), type, occurredAt, payload }` with a Zod schema per type; payloads carry identifiers only.
- At-most-once delivery is the documented guarantee; durable delivery arrives with the transactional outbox in SD-180.
- Metrics counters for published and handled events (SD-121).

📚 Source: backlog SD-113 (Epic 22) · provenance [DESIGN] · priority P1

📏 Estimated size of issue: M (1-2 person-days, BE)

### ✅ Acceptance Criteria

- [ ] A subscriber in process B receives events published by process A, in order for a single publisher.
- [ ] An invalid envelope is dropped, counted and logged without a payload dump.
- [ ] Unsubscribing releases the handler; a handler that throws does not stop others.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 22.1 (SD-110)
SDISSUE_EOF
create_issue 4 '[Task 22.4] Event bus abstraction on Redis pub/sub' 'Module 4: Foundation and Platform' 'backend,medium-priority,epic:redis' "$BODY"

# ---- Epic 23: Public API and API Keys ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

One source of truth for the contract: the same Zod schemas that validate requests produce the published OpenAPI 3.1 document, and a test proves no route is undocumented.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Extend the route registry that `defineRoute` already records (path, method, auth option, permission, request and response schemas) so each route can declare an `openapi` block (summary, tag, response schemas, error codes).
- Generator script `npm run openapi:generate` writing `apps/backend/openapi/openapi.json`; served by `GET /api/v1/openapi.json`; committed so reviewers see contract diffs.
- `/api/v1/tickets` and `/api/v1/tickets/{id}` alias the existing handlers; the SPA keeps using `/api/...`.
- Contract tests: every registered route is documented or explicitly listed as internal; response bodies of the happy paths validate against the declared schemas; `openapi-diff` in CI flags breaking changes.
- Security schemes: `cookieSession` + `csrfHeader` for browser routes, `bearerApiKey` for v1.

📚 Source: backlog SD-114 (Epic 23) · provenance [STANDARD] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE, Docs)

### ✅ Acceptance Criteria

- [ ] The document validates against the OpenAPI 3.1 schema (spectral lint in CI).
- [ ] Adding a route without declaring it public or internal fails the contract test (SEC-106).
- [ ] A removed response field fails `openapi-diff` as breaking.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 21.3 (SD-106)
SDISSUE_EOF
create_issue 4 '[Task 23.1] OpenAPI document generated from the Zod schemas, `/api/v1`' 'Module 4: Foundation and Platform' 'backend,documentation,high-priority,epic:public-api' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Let a user create long-lived, scoped, revocable credentials for scripts, stored so that a database leak does not reveal them.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration for `api_keys` (section 3); permissions `api-keys:manage-own` in `codes.ts`, `matrix.ts`, `docs/permissions.md`.
- Key format `sdk_<8-char prefix>_<43-char base64url of 32 random bytes>`; digest is `SHA-256(API_KEY_PEPPER || secret)` stored hex; the prefix identifies the row, constant-time digest comparison.
- Scopes limited to ticket scopes (`tickets:create`, `tickets:read`, `tickets:status:update`, `tickets:assign`), each mapping to existing permission codes; the creation endpoint refuses any scope the caller does not hold now.
- Expiry required (maximum 365 days, default 90); maximum 10 active keys per user; name sanitised with `sanitizeForLog`.
- Audit events `API_KEY_CREATED`, `API_KEY_REVOKED`, `API_KEY_USED_DENIED` (catalogue and schema; details hold ids and scopes, never the secret or digest).
- Revoke when the owner is blocked, deleted or loses the role that granted the scopes (hook into the existing session-revocation transactions).

📚 Source: backlog SD-115 (Epic 23) · provenance [HARDENING] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] The database holds only the digest; the secret is returned once, in the creation response, and never again (SEC-107).
- [ ] A revoked, expired or owner-blocked key is refused with `401 API_KEY_INVALID` (SEC-107).
- [ ] A user cannot create a key with a scope the role does not grant (SEC-108).
- [ ] Administrator holds no `api-keys:*` permission (`matrix.test.ts`).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 23.1 (SD-114), Task 21.4 (SD-107)
SDISSUE_EOF
create_issue 4 '[Task 23.2] API key model, issuance and revocation' 'Module 4: Foundation and Platform' 'backend,database,security,high-priority,epic:public-api' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Authenticate machine clients without cookies or CSRF, while keeping every authorization and object-level rule of the browser path.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- New `defineRoute` authentication option `apiKey` (allowed only on `/api/v1` routes): reads `Authorization: Bearer`, resolves the key, builds the same `AuthContext` as a session with `authStage: 'full'` and `authMethod: 'api_key'`.
- Effective permissions are the **intersection** of the key's scopes and the owner's current permissions, evaluated at request time (SEC-108).
- Cookie and bearer credentials in one request return `400 MIXED_CREDENTIALS` (SEC-109); CSRF and Origin checks do not apply to key-authenticated requests, but CORS stays closed (no `Access-Control-Allow-Origin`), so browsers cannot use keys cross-site.
- Per-key rate limit (default 120 per minute, configurable in security settings) via the shared limiter; failures return `429` with `Retry-After`, identical for valid and invalid prefixes (SEC-110).
- Update `last_used_at` at most once per minute per key (write throttling).
- Audit: key-authenticated writes carry `actor` = owner and `details.auth = 'api_key'` plus the key prefix.

📚 Source: backlog SD-116 (Epic 23) · provenance [HARDENING] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] A key without `tickets:create` cannot create a ticket; a key whose owner was demoted loses the permission immediately (SEC-108).
- [ ] A request with both a session cookie and a bearer key is rejected (SEC-109).
- [ ] The 121st request in a minute returns `429`; an invalid-prefix flood returns the same envelope (SEC-110).
- [ ] The object-level rule still holds: a key of a Guest reads only that Guest's tickets (`404` otherwise).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 23.2 (SD-115), Task 22.2 (SD-111)
SDISSUE_EOF
create_issue 4 '[Task 23.3] API key authentication stage and per-key limits' 'Module 4: Foundation and Platform' 'backend,security,high-priority,epic:public-api' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Notify external systems of ticket events with authenticated, replay-resistant, SSRF-safe deliveries.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Domain events `ticket.created`, `ticket.assigned`, `ticket.status_changed` emitted from `tickets/service.ts` after commit through a small in-process emitter (`server/events/domain-events.ts`), later superseded by the transactional outbox (SD-180).
- A subscriber receives only events of tickets its **owner may read** (the `tickets/policy.ts` predicate is applied at emit time), and the payload contains identifiers, status and timestamps only, never title or description.
- Signature: `X-SecureDesk-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, t + "." + body)>` plus `X-SecureDesk-Event-Id` for idempotency; a documented 5-minute tolerance for receivers; a reference verifier snippet in `docs/webhooks.md` and a tested Node implementation in `examples/`.
- Delivery worker: durable `webhook_deliveries` rows, attempts at 10 s, 1 min, 5 min, 30 min, 2 h with jitter, then `DEAD`; the subscription is disabled after 20 consecutive failures; 5 s connect and 10 s total timeout; redirects not followed; response body discarded.
- SSRF guard shared (`server/security/ssrf-guard.ts`): HTTPS only (HTTP only for `WEBHOOK_ALLOW_LOOPBACK` in tests), resolve DNS and refuse loopback, private, link-local (169.254.0.0/16 including cloud metadata), unique-local IPv6 and multicast; **re-check at delivery time** and connect to the resolved IP (defeats DNS rebinding); refuse userinfo in URLs and non-standard ports unless allowlisted.
- Secrets generated server-side (shown once), stored encrypted; rotation endpoint with a 24-hour overlap where both signatures are sent.

📚 Source: backlog SD-117 (Epic 23) · provenance [STANDARD] · priority P1

📏 Estimated size of issue: XL (6-8 person-days, BE)

### ✅ Acceptance Criteria

- [ ] The reference verifier accepts a delivery and rejects a tampered body, a wrong secret and a timestamp older than five minutes (SEC-111).
- [ ] Subscribing to `http://169.254.169.254/`, `https://localhost/`, an internal hostname, or a hostname that resolves to a private address is refused with `422 WEBHOOK_TARGET_REFUSED`; a host that changes its DNS answer after subscription is refused at delivery (SEC-112).
- [ ] A failing receiver yields the documented retry schedule on the fake clock, then `DEAD`; the ticket request that caused the event is never delayed (SEC-113).
- [ ] A user never receives an event for a ticket they cannot read (leak test across roles).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 23.1 (SD-114), Task 22.4 (SD-113)
SDISSUE_EOF
create_issue 4 '[Task 23.4] Outbound signed webhooks' 'Module 4: Foundation and Platform' 'backend,security,medium-priority,epic:public-api' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Make the integration surface usable and demonstrable without `curl`.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Angular pages `/account/api-keys` and `/account/webhooks` (standalone components, route guards by permission, one-time secret display held in memory and cleared on navigation, copy button, delivery log table).
- Generate a TypeScript client from `openapi.json` into `packages/api-client/` (workspace package, `openapi-typescript` plus a 40-line fetch wrapper); the Angular app is **not** switched to it in this module (record as D4-07), but a Node example script uses it.
- `docs/api.md`: authentication, scopes, errors, rate limits, pagination, webhook verification, a complete `curl` walkthrough, and a Postman collection export.
- Component and E2E tests: create a key, copy it, call `/api/v1/tickets` with it, revoke, see `401`.

📚 Source: backlog SD-118 (Epic 23) · provenance [PORTFOLIO] · priority P1

📏 Estimated size of issue: M (1-2 person-days, FE, Docs)

### ✅ Acceptance Criteria

- [ ] The key secret never appears in the DOM after the creation dialog closes, in the URL, in storage or in console output.
- [ ] The documented `curl` walkthrough works verbatim against the compose stack.
- [ ] The generated client compiles in CI and its example script creates and reads a ticket.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 23.3 (SD-116), Task 23.4 (SD-117)
SDISSUE_EOF
create_issue 4 '[Task 23.5] Key and webhook management UI, generated client and integration docs' 'Module 4: Foundation and Platform' 'frontend,documentation,medium-priority,epic:public-api' "$BODY"

# ---- Epic 24: Production Hardening ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

The API already sends CSP, `nosniff`, framing and referrer headers; the SPA that users actually load sends none. Ship a reference proxy configuration with a strict policy.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `deploy/Caddyfile`: automatic TLS (local CA in dev), HTTP to HTTPS redirect, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy` denying camera, microphone, geolocation, `Cross-Origin-Opener-Policy: same-origin`, and a CSP such as `default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`.
- Make the Angular build CSP-compatible: no inline scripts, `ngCspNonce` or hashed styles, fonts self-hosted (already via `@fontsource`); remove any inline style that needs `'unsafe-inline'`, and verify the Turnstile widget and the local CAPTCHA image work.
- The proxy **overwrites** `X-Forwarded-For` with the address it saw (matches the existing `TRUSTED_PROXY_HOPS=1` contract); document and test it.
- Long-cache immutable hashed assets, `no-store` for `index.html`.
- Test script `scripts/check-headers.ts` that fetches the SPA through the proxy and asserts every header, the absence of `unsafe-inline` and `unsafe-eval` in `script-src`, and that a spoofed incoming `X-Forwarded-For` has no effect (SEC-114).

📚 Source: backlog SD-119 (Epic 24) · provenance [HARDENING] [STANDARD] · priority P0

📏 Estimated size of issue: M (1-2 person-days, DevOps)

### ✅ Acceptance Criteria

- [ ] The SPA responds with the full header set above on every route; an online grader (securityheaders.com style check, run locally via the script) reports at least A.
- [ ] Browser console shows no CSP violation during the login, ticket and admin journeys (E2E assertion on `securitypolicyviolation`).
- [ ] A client-supplied `X-Forwarded-For` cannot change the recorded address (SEC-56 still holds through the proxy).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 20.5 (SD-101)
SDISSUE_EOF
create_issue 4 '[Task 24.1] Reverse proxy reference deployment and SPA security headers' 'Module 4: Foundation and Platform' 'devops,security,high-priority,epic:prod-hardening' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

The README states that ticket creation, assignment and status changes are not audit events. For a helpdesk that is the most obvious gap; close it without putting ticket text into the log.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Catalogue entries in `audit/events.ts`: `TICKET_CREATED`, `TICKET_ASSIGNED`, `TICKET_STATUS_CHANGED` (outcomes, strict details: `ticketId`, `from`, `to`, `assigneeId`), `TICKET_ACCESS_DENIED` stays as `OBJECT_ACCESS_DENIED`.
- Call them from `tickets/service.ts` inside the same transaction as the change (fail-closed, like other state changes).
- Update `audit-coverage.test.ts` and the route coverage guard so a new ticket mutation without an entry fails.
- Update README ("Ticket creation … are not audit events"), `docs/audit-log.md`, the threat model and the demo notes.

📚 Source: backlog SD-120 (Epic 24) · provenance [HARDENING] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE)

### ✅ Acceptance Criteria

- [ ] Creating, assigning and changing the status of a ticket each write exactly one entry with actor, ticket id and old and new values; the title and description are not in the entry (SEC-115).
- [ ] If the audit write fails, the ticket change rolls back (SEC-73 pattern).
- [ ] The coverage guard fails when a ticket mutation route does not record an entry.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 21.4 (SD-107)
SDISSUE_EOF
create_issue 4 '[Task 24.2] Audit ticket lifecycle events' 'Module 4: Foundation and Platform' 'backend,security,high-priority,epic:prod-hardening' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Make the system observable the way a production service would be: request traces, security-relevant metrics, and a provisioned dashboard.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `instrumentation.ts`: `@opentelemetry/sdk-node` with the HTTP and `pg` instrumentations, W3C trace context propagated to outbound webhook and Turnstile calls, OTLP exporter only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; **no request bodies, cookies, `Authorization`, logins or IPs as span attributes** (attribute allowlist).
- `GET /api/metrics` (Prometheus text) protected by `Bearer METRICS_TOKEN` and bound to the internal compose network; metrics: request duration histogram by route template and status class, `login_outcomes_total{outcome}`, `audit_append_seconds`, `audit_verify_status`, `rate_limit_refusals_total{purpose}`, `redis_up`, `postgres_pool_in_use`, `webhook_deliveries_total{status}`, `security_events_total{type,severity}`.
- Label cardinality guard: only declared label values; a test fails when a label would contain a user-controlled string.
- Add Prometheus and an OTel collector to the `observability` compose profile; provision a Grafana dashboard JSON (security overview: logins, lockouts, alerts, latency) beside the existing Loki dashboard; screenshot in `docs/`.

📚 Source: backlog SD-121 (Epic 24) · provenance [STANDARD] · priority P1

📏 Estimated size of issue: L (3-5 person-days, BE, DevOps)

### ✅ Acceptance Criteria

- [ ] `/api/metrics` returns `401` without the token and is not reachable from the public proxy route (SEC-116).
- [ ] Spans for a login contain the route template and status but none of login, IP, cookie or password (test over exported spans).
- [ ] The Grafana dashboard loads from provisioning and shows data after the bot-sim run.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 21.3 (SD-106)
SDISSUE_EOF
create_issue 4 '[Task 24.3] OpenTelemetry traces and Prometheus metrics' 'Module 4: Foundation and Platform' 'backend,devops,medium-priority,epic:prod-hardening' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Translate the existing controls and SEC tests into the vocabulary hiring managers and auditors use, and be honest about gaps.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `docs/asvs.md`: for ASVS 5.0 level 1 (all chapters) and level 2 (V2 authentication, V3 session, V4 access control, V7 logging, V13 API): requirement ID, status (`MET`, `PARTIAL`, `NOT APPLICABLE`, `GAP`), control, code path, test ID. Machine-readable twin `docs/asvs.json`.
- Script `scripts/check-asvs.ts` (added to `npm test`): every referenced `SEC-nn` exists in `docs/testing.md`; every requirement has a status; `GAP` entries link to a backlog item.
- Summary table with percentages per chapter in the README.

📚 Source: backlog SD-122 (Epic 24) · provenance [STANDARD] [PORTFOLIO] · priority P1

📏 Estimated size of issue: M (1-2 person-days, Docs)

### ✅ Acceptance Criteria

- [ ] All level 1 requirements are classified; no `GAP` without a linked backlog issue or accepted-risk note.
- [ ] The check script fails when a referenced test ID is removed (SEC-117).
- [ ] The README shows the summary and links the full table.
- [ ] Minimum 80% test coverage for this module (the check script is unit tested).

### 🔗 Dependencies

Task 19.1 (SD-93)
SDISSUE_EOF
create_issue 4 '[Task 24.4] OWASP ASVS mapping and gap analysis' 'Module 4: Foundation and Platform' 'documentation,security,medium-priority,epic:prod-hardening' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Close the module: everything green, documented and released.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-4.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Add SEC-97 to SEC-118 to `docs/testing.md`; extend the threat model with section 8's table; update `docs/architecture.md`, `docs/permissions.md`, `docs/database-schema.md`, README.
- E2E journey: clean clone, `docker compose up`, sign in as the four roles, create an API key, call `/api/v1/tickets`, receive a signed webhook on a local receiver, and verify the audit chain on Postgres.
- Run the verification sequence (section 12) three times; tag `v1.0.0` and let the release pipeline produce signed artifacts.
- Update the Polish report generator source or add `docs/course/report-module-4.md` (optional, not course-required).

📚 Source: backlog SD-123 (Epic 24) · provenance [FOUNDATION] · priority P0

📏 Estimated size of issue: M (1-2 person-days, Docs, QA)

### ✅ Acceptance Criteria

- [ ] All checks green on `main`: CI, CodeQL, gitleaks, Trivy, E2E (three consecutive runs), ZAP baseline.
- [ ] `v1.0.0` release exists with signed images, SBOM and provenance.
- [ ] A reviewer can run the whole system from the README in under 10 minutes.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

all P0 tasks of Module 4
SDISSUE_EOF
create_issue 4 '[Task 24.5] Module 4 verification, documentation and release' 'Module 4: Foundation and Platform' 'documentation,testing,high-priority,epic:prod-hardening' "$BODY"

# ---- Epic 25: Passkeys and WebAuthn ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Lay the data and configuration foundation: where credentials live, how challenges are issued and consumed once, and how the relying party is identified.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration for `webauthn_credentials` and `auth_challenges` (section 3); permission `passkeys:manage-own` in `codes.ts`, `matrix.ts`, `docs/permissions.md`.
- `server/auth/webauthn/config.ts`: RP ID from `WEBAUTHN_RP_ID`, expected origin from `APP_ORIGIN`; start-up refuses an RP ID that is not a suffix of the origin's host, and in production refuses `localhost`.
- Library: `@simplewebauthn/server` wrapped in `server/auth/webauthn/ceremony.ts` so the rest of the code sees only our types.
- Challenge service: 32 random bytes, purpose-bound, 5-minute expiry, consumed in the same transaction as the verification (`consumed_at` set with a conditional update, so replays fail).
- ADR `0011-passkeys.md`: attestation `none`, user verification `required`, resident keys `preferred`, algorithms ES256 and RS256 only.

📚 Source: backlog SD-124 (Epic 25) · provenance [STANDARD] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] A challenge can be consumed once; a second use, an expired one, or one with the wrong purpose is refused (SEC-119).
- [ ] An origin or RP ID mismatch in a verification is refused (SEC-120).
- [ ] Start-up validation rejects an invalid or production-unsafe RP ID.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 21.4 (SD-107), Task 19.4 (SD-96)
SDISSUE_EOF
create_issue 5 '[Task 25.1] Credential model, WebAuthn configuration and challenge store' 'Module 5: Identity' 'backend,database,security,authentication,high-priority,epic:passkeys' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

An authenticated user adds a passkey, safely.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `register/options`: requires a full session and a step-up newer than 10 minutes (`STEP_UP_REQUIRED` otherwise); builds options with `excludeCredentials` of the user's existing credentials, `userVerification: required`, a random opaque user handle (`user_handle` per user, **not** the login or id), 60-second timeout; stores the challenge.
- `register/verify`: verifies origin, RP ID hash, challenge, user verification flag and algorithm; rejects a credential ID already registered to anyone; stores public key, counter, transports, AAGUID, backup flags; maximum 10 per user.
- Audit events `PASSKEY_REGISTERED`, `PASSKEY_REGISTRATION_FAILED` (reason codes only); notification email (SD-138) when added.
- Name: 1 to 40 characters, sanitised with `sanitizeForLog`.

📚 Source: backlog SD-125 (Epic 25) · provenance [STANDARD] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] Registration without a fresh step-up returns `403 STEP_UP_REQUIRED` (SEC-119).
- [ ] A reused challenge, wrong origin or wrong RP ID fails with the generic error and writes `PASSKEY_REGISTRATION_FAILED` (SEC-120).
- [ ] Registering the same authenticator twice, or an eleventh credential, is refused.
- [ ] The user handle is random and unrelated to the login.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 25.1 (SD-124), Task 25.4 (SD-127) (step-up)
SDISSUE_EOF
create_issue 5 '[Task 25.2] Registration ceremony' 'Module 5: Identity' 'backend,security,authentication,high-priority,epic:passkeys' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Sign in with a passkey, without a password and without revealing which accounts exist.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `login/options`: anonymous, rate-limited per address (shared limiter), returns a challenge with an empty `allowCredentials` (discoverable credentials, usernameless).
- `login/verify`: looks up the credential by ID, verifies signature, challenge, origin, RP ID, user-verification flag and counter; unknown credential, wrong signature, replayed challenge and blocked or deleted user all return the **same** generic `401 PASSKEY_VERIFICATION_FAILED` with indistinguishable timing (do the same work, compare in constant time, add a dummy verification for the unknown case).
- Counter handling: if both stored and reported counters are non-zero and the reported one is not greater, refuse and raise a security event `PASSKEY_CLONE_SUSPECTED` (SEC-122); counters equal to zero (synced passkeys) are accepted.
- On success create a full session with `methods = ['passkey']`, `auth_time = now`; passkeys with user verification count as multi-factor. A user with `must_change_password` is **not** exempt: the initial-change stage still applies to password-only sessions, and a passkey session skips it (the temporary password is irrelevant), decision D5-02.
- Account locks from password failures (Module 2) do **not** block passkey login, since the lock defends password guessing; `is_blocked` and soft-delete do (SEC-123).
- Audit events `AUTH_PASSKEY_LOGIN` success and failure (reason enum), IP-address failure limits as in Module 2; the honeypot and the CAPTCHA do not apply (no password to guess), but the per-address limit and IP block do.

📚 Source: backlog SD-126 (Epic 25) · provenance [STANDARD] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] A valid assertion creates a session with `methods = ['passkey']`; the audit entry records the method (SEC-123).
- [ ] Unknown credential, forged signature, replayed challenge, wrong origin and a blocked owner produce byte-identical envelopes and similar timing (SEC-121, SEC-124).
- [ ] A counter regression with non-zero counters is refused and creates a security event (SEC-122).
- [ ] A password-locked account can still use its passkey; a blocked account cannot (SEC-123).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 25.1 (SD-124), Task 22.2 (SD-111)
SDISSUE_EOF
create_issue 5 '[Task 25.3] Passkey authentication ceremony and session creation' 'Module 5: Identity' 'backend,security,authentication,high-priority,epic:passkeys' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Treat "second factor" as TOTP **or** passkey, let the administrator require it by role, and demand fresh authentication for sensitive actions.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Add `auth_methods` and `auth_time` to `sessions`; a helper `requireFreshAuth(maxAgeSeconds)` for `defineRoute` that returns `403 STEP_UP_REQUIRED` with the accepted methods.
- `POST /api/auth/step-up`: accepts the current password, a TOTP code or a passkey assertion; success updates `auth_time` and appends the method; failures count against the same limiter as password-change failures (SEC-60 pattern).
- Policy: security settings `mfa_required_roles` (set of roles, default empty) and `step_up_max_age_minutes` (default 10, range 1 to 60); a user in a required role without TOTP or passkey receives the restricted stage `MFA_ENROLMENT_REQUIRED` (allowed endpoints: enrolment, logout, `me`), enforced in the backend stage check, not in Angular (SEC-125).
- Sensitive routes that now require step-up: password change, passkey and TOTP management, API key and webhook creation, administrator user create, role change, reset, block, delete, security settings and auth-policy changes, audit export.
- Cannot remove the last second factor of a user whose role requires it (SEC-127); administrator reset (`users:reset-passkeys`, existing `users:reset-totp`) revokes all target sessions and is audited.
- Update `docs/permissions.md`, `docs/architecture.md` (session model), the threat model.

📚 Source: backlog SD-127 (Epic 25) · provenance [HARDENING] [STANDARD] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] With `mfa_required_roles = {manager}`, a manager without a second factor reaches nothing except enrolment (SEC-125).
- [ ] A sensitive action with `auth_time` older than the window returns `STEP_UP_REQUIRED`; after a successful step-up the same call works (SEC-126).
- [ ] Removing the last second factor of a required role is refused (SEC-127).
- [ ] The administrator reset removes factors, revokes sessions and cannot target `ADMIN` (SEC-129).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 25.1 (SD-124), Module 1 (TOTP)
SDISSUE_EOF
create_issue 5 '[Task 25.4] Step-up authentication and the multi-factor policy' 'Module 5: Identity' 'backend,security,authentication,high-priority,epic:passkeys' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Users can manage passkeys, and a lost authenticator does not mean a lost account.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Angular page `/account/security`: list passkeys (name, created, last used, synced or device-bound), add (with `navigator.credentials.create` and graceful unsupported-browser message), rename, remove (step-up required), TOTP status, recovery codes panel.
- Recovery codes: 10 single-use codes of 10 characters (Crockford base32, CSPRNG), stored as Argon2id hashes, displayed once and held in memory; regenerating invalidates the old set; a code is accepted only on the restricted second-factor stage and creates an audit event and an email (SD-138); a used code cannot be reused.
- Login UI: "Sign in with a passkey" button (conditional UI autofill where supported) beside the password form.
- Component tests for each state; E2E in SD-129.

📚 Source: backlog SD-128 (Epic 25) · provenance [DESIGN] · priority P1

📏 Estimated size of issue: L (3-5 person-days, FE, BE)

### ✅ Acceptance Criteria

- [ ] Recovery codes are shown once, never stored in plaintext, and a used code fails (SEC-128).
- [ ] Regenerating invalidates every code of the previous set (SEC-128).
- [ ] Removing a passkey needs step-up; the UI never shows credential IDs or public keys.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 25.2 (SD-125), Task 25.3 (SD-126)
SDISSUE_EOF
create_issue 5 '[Task 25.5] Passkey management UI and recovery codes' 'Module 5: Identity' 'frontend,backend,security,authentication,medium-priority,epic:passkeys' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Prove the ceremonies in a real browser and in deterministic unit tests.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Playwright helper enabling the Chromium DevTools virtual authenticator (`WebAuthn.addVirtualAuthenticator`, CTAP2, internal, resident key, user verification); specs: register, log in, remove, step-up, policy enrolment, recovery code.
- Unit tests with fixtures signed by a test key pair (a small `tests/support/webauthn-authenticator.ts` that builds attestation and assertion objects) so negative cases (bad signature, bad flags, wrong RP hash) need no browser.
- Add SEC-119 to SEC-129 to `docs/testing.md`; extend the threat model (section 8); write `docs/passkeys.md` (flows, sequence diagram, recovery story).

📚 Source: backlog SD-129 (Epic 25) · provenance [FOUNDATION] · priority P0

📏 Estimated size of issue: M (1-2 person-days, QA, Docs)

### ✅ Acceptance Criteria

- [ ] E2E registers a passkey, signs out, signs in with it, and removes it (three consecutive runs green).
- [ ] Every negative case in the matrix has a unit test with a SEC title.
- [ ] `docs/passkeys.md` contains the two sequence diagrams and the recovery policy.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 25.2 (SD-125), Task 25.3 (SD-126), Task 25.4 (SD-127), Task 25.5 (SD-128)
SDISSUE_EOF
create_issue 5 '[Task 25.6] Tests with a virtual authenticator, documentation and threat model' 'Module 5: Identity' 'testing,documentation,authentication,high-priority,epic:passkeys' "$BODY"

# ---- Epic 26: OIDC Single Sign-On ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Configure a standards-compliant relying party and a reproducible identity provider for development and CI.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Library `openid-client`; `server/auth/oidc/provider.ts` performs discovery with a timeout, caches the document and JWKS (refresh on unknown `kid`, at most once per minute), validates that the issuer equals `OIDC_ISSUER` exactly.
- Compose profile `idp`: Keycloak with an imported realm `deploy/keycloak/securedesk-realm.json` (client `securedesk` as a confidential client with PKCE `S256` required, redirect URI `http://localhost:4200/api/auth/oidc/callback`, users `sso-employee` and `sso-unverified` with fixture passwords, a role claim mapper, `acr` and `amr` mappers). Fixture passwords exist only in the realm file, are marked test-only, and are rejected in production configuration.
- Start-up validation: all `OIDC_*` set or none; HTTPS issuer required in production; `localhost` issuer refused in production.
- `GET /api/auth/oidc/config` returns whether SSO is enabled and its button label, nothing else.

📚 Source: backlog SD-130 (Epic 26) · provenance [STANDARD] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE, DevOps)

### ✅ Acceptance Criteria

- [ ] `docker compose --profile idp up` starts Keycloak with the realm imported; discovery succeeds.
- [ ] Partial configuration and production misconfiguration fail start-up.
- [ ] The JWKS cache refreshes once on an unknown `kid` and not more than once per minute under attack.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 20.5 (SD-101), Task 22.1 (SD-110)
SDISSUE_EOF
create_issue 5 '[Task 26.1] OIDC client foundation and a local Keycloak realm' 'Module 5: Identity' 'backend,devops,authentication,high-priority,epic:oidc-sso' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Implement the redirect flow exactly as current best practice describes, with every check explicit and tested.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `start`: generate `state`, `nonce` and a PKCE verifier (`S256`), store them in `auth_challenges` (purpose `OIDC_STATE`, 10-minute expiry, bound to a random `__Host-sd_oidc` cookie that is `HttpOnly`, `Secure`, `SameSite=Lax`, path `/api/auth/oidc`); validated `returnTo` is a relative path from an allowlist of SPA routes (open redirect refused, SEC-137).
- `callback`: require the cookie, a matching unconsumed `state`, an `iss` parameter equal to the configured issuer (RFC 9207 when present), exchange the code with the verifier, validate the ID token: signature with allowed algorithms only (`RS256`, `ES256`, `EdDSA`; `none` and `HS*` refused), `iss`, `aud` equals client ID, `azp` when multiple audiences, `exp`, `iat` skew of 60 seconds, `nonce`; the access token is not stored or used.
- All failures return one generic `401 OIDC_LOGIN_FAILED` and write `AUTH_OIDC_LOGIN` failure with a reason enum; the user sees the login page with a neutral message.
- Rate limits per address on both endpoints; timeouts on all outbound calls; no token or code in logs or URLs after the callback (redirect to a clean URL).

📚 Source: backlog SD-131 (Epic 26) · provenance [STANDARD] [HARDENING] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] Missing, tampered, replayed or expired `state`, and a missing cookie, are refused with no session (SEC-130).
- [ ] Wrong `nonce`, `aud`, `iss`, expired token, `alg: none` and `HS256` signed with the public key are refused (SEC-131).
- [ ] A callback whose verifier does not match (code interception) is refused (SEC-132).
- [ ] `returnTo` pointing outside the allowlist is ignored (SEC-137).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 26.1 (SD-130)
SDISSUE_EOF
create_issue 5 '[Task 26.2] Authorization Code flow with PKCE and ID token validation' 'Module 5: Identity' 'backend,security,authentication,high-priority,epic:oidc-sso' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Decide safely which local account an external identity maps to, because account-linking mistakes are the classic SSO takeover.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration `external_identities`; unique `(provider, subject)`.
- Resolution order: (1) existing link by `(issuer, sub)`; (2) otherwise, if setting `oidc_link_by_verified_email` is on **and** the ID token has `email_verified = true` **and** the local account's email is verified **and** the account is not protected `ADMIN` and not blocked or deleted, link after a step-up confirmation by the local user (never silent); (3) otherwise, if setting `oidc_jit_provisioning` is on, create a user with the **Guest** role, no password hash usable (random Argon2id of 32 random bytes, never disclosed), and `must_change_password = false`; (4) otherwise refuse generically.
- Blocked and soft-deleted users are refused (SEC-136); `ADMIN` can never be linked or created through OIDC (SEC-135).
- Defaults: both settings off; the administrator enables them in the auth policy (SD-144).
- Audit events `AUTH_OIDC_LINKED`, `AUTH_OIDC_PROVISIONED` with provider and subject reference (keyed, not the raw `sub`).

📚 Source: backlog SD-132 (Epic 26) · provenance [HARDENING] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] An `email_verified = false` identity whose email matches a local account never links to it (SEC-133).
- [ ] With JIT off, an unknown subject is refused generically; with JIT on, the new user is a Guest regardless of claims (SEC-134).
- [ ] Linking requires a step-up of the local account; a stolen IdP identity alone cannot take over an existing local account (SEC-133).
- [ ] Blocked, deleted and `ADMIN` accounts are refused (SEC-135, SEC-136).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 26.2 (SD-131), Task 27.2 (SD-136)
SDISSUE_EOF
create_issue 5 '[Task 26.3] Account provisioning and linking policy' 'Module 5: Identity' 'backend,database,security,authentication,high-priority,epic:oidc-sso' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Map IdP claims to SecureDesk roles without privilege escalation, and make SSO sessions behave like every other session.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Setting `oidc_role_mapping`: an explicit map from claim values to role IDs; strict schema; the mapping can never produce `administrator` (validated at save and at use, SEC-135); unmapped means Guest.
- Role reconciliation on each login can only **lower or keep** privileges automatically; raising a role requires an administrator action (decision D5-04), and each change is audited.
- SSO sessions are ordinary server-side sessions (same idle and absolute limits, same revocation); `methods` gets `oidc` plus the IdP's `amr` values mapped (`mfa`, `hwk`, `otp`); `auth_time` comes from the token.
- Lockout and CAPTCHA are not applied to SSO; IP block and rate limits are.
- RP-initiated logout (`end_session_endpoint` with `id_token_hint`) when the user signs out of an SSO session, optional via setting; local logout always works even if the IdP is down.
- Back-channel logout is out of scope (record as O5-02).

📚 Source: backlog SD-133 (Epic 26) · provenance [STANDARD] [HARDENING] · priority P1

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] A claim equal to `administrator` does not create or promote an administrator unless explicitly mapped, and an explicit mapping to `administrator` is rejected at save (SEC-135).
- [ ] An SSO user blocked locally loses sessions immediately (existing SEC-18 behaviour) and cannot sign in again (SEC-136).
- [ ] Logout revokes the local session; an IdP outage does not prevent it (SEC-138).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 26.3 (SD-132), Task 25.4 (SD-127)
SDISSUE_EOF
create_issue 5 '[Task 26.4] Role mapping, session semantics and logout' 'Module 5: Identity' 'backend,security,authentication,medium-priority,epic:oidc-sso' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

A visible, tested single sign-on journey.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Login page shows "Sign in with <label>" only when `GET /api/auth/oidc/config` says enabled; neutral error banner for `OIDC_LOGIN_FAILED`.
- Account page lists the linked identity with an unlink action (step-up required; refused when it would leave the user without any usable credential).
- Playwright against the `idp` profile: successful login of `sso-employee` (JIT on), refused `sso-unverified` linking attempt, tampered `state` via request interception, expired code.
- `docs/sso.md`: sequence diagram, claims used, settings, Keycloak setup, how to point at another IdP.

📚 Source: backlog SD-134 (Epic 26) · provenance [PORTFOLIO] · priority P1

📏 Estimated size of issue: M (1-2 person-days, FE, QA, Docs)

### ✅ Acceptance Criteria

- [ ] The E2E journey signs in through Keycloak and lands on the dashboard with the Guest role.
- [ ] Unlinking the only credential is refused.
- [ ] `docs/sso.md` reproduces the setup from a clean clone.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 26.2 (SD-131), Task 26.4 (SD-133)
SDISSUE_EOF
create_issue 5 '[Task 26.5] SSO UI, E2E against Keycloak and documentation' 'Module 5: Identity' 'frontend,testing,documentation,authentication,medium-priority,epic:oidc-sso' "$BODY"

# ---- Epic 27: Recovery and Device Sessions ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

One safe way to send email, used by recovery now and by notifications in Module 7.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `server/mail/mailer.ts`: `interface Mailer { send(message) }`; SMTP implementation with `nodemailer`, TLS required unless the host is loopback, timeouts; `FakeMailer` for tests capturing messages.
- `email_outbox` table and a worker (interval job using the same scheduler pattern as `scheduled-verification.ts`) with retries 1 min, 10 min, 1 h, then `FAILED`; at-least-once; rows purged after 7 days.
- Templates in `server/mail/templates/` (plain text first, minimal HTML), rendered with escaped variables; subjects and headers sanitised against header injection (CR and LF refused).
- Mailpit in the compose `mail` profile; `MAIL_FROM` validated.
- Rules: no password, TOTP secret or recovery code in any mail; one-time links only, `Cache-Control` irrelevant but links carry no personal data beyond the token; mail bodies are never logged.

📚 Source: backlog SD-135 (Epic 27) · provenance [DESIGN] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE, DevOps)

### ✅ Acceptance Criteria

- [ ] A message with CR or LF in the recipient or subject is refused (header injection test).
- [ ] An SMTP outage retries on the documented schedule and never delays or fails the originating request (SEC-145).
- [ ] The sent mail appears in Mailpit during E2E with the expected link.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 21.3 (SD-106), Task 20.5 (SD-101)
SDISSUE_EOF
create_issue 5 '[Task 27.1] Mail service with outbox, templates and Mailpit' 'Module 5: Identity' 'backend,devops,authentication,high-priority,epic:recovery-sessions' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Users reset their own forgotten password without an administrator, without enabling account enumeration or token theft.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration adding `email`, `email_normalized` (unique, nullable) and `email_verified_at` to `users`; administrators set the email at user creation or edit; a verification link mail confirms it (token as below); only a verified email can receive reset links.
- `POST /api/auth/password/forgot`: always returns the same `202` and the same body, after the same amount of work (dummy token generation and hashing for unknown emails), regardless of existence, blocked, deleted or unverified state (SEC-139); requires the CAPTCHA (same provider as password change); limits per address and per normalised email (SEC-142).
- Token: 32 random bytes (base64url), stored as SHA-256 digest in `password_resets`, 30-minute expiry, single use, a new request invalidates earlier ones, `requested_ip_hash` keyed.
- `POST /api/auth/password/reset` with token and new password: applies the existing password policy, history of the last five, banned list and personal-data rule (SEC-09 to SEC-14); on success: revokes **all** sessions, clears any lock, marks the token used, invalidates other tokens, sends a "password changed" mail; the protected `ADMIN` account is **excluded** from self-service reset and stays on the CLI `admin:unlock` and database procedure (D5-03).
- Audit events `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `PASSWORD_RESET_REFUSED` (reason enum), subject by keyed reference for unknown emails (SD-67 pattern).
- Angular pages `/forgot-password` and `/reset-password` (token read from the URL fragment is **not** possible server-side; use the query parameter once, then `history.replaceState` to remove it, and set `Referrer-Policy: no-referrer` already globally).

📚 Source: backlog SD-136 (Epic 27) · provenance [HARDENING] [STANDARD] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE, FE)

### ✅ Acceptance Criteria

- [ ] Existing, unknown, blocked and unverified emails produce an identical response with similar timing (SEC-139).
- [ ] The token is stored only as a digest, expires at exactly 30 minutes on the fake clock, works once, and dies with a newer request or a password change (SEC-140).
- [ ] A reset applies password policy and history, revokes every session and sends a notification (SEC-141).
- [ ] Rate limits and CAPTCHA stop mass requests (SEC-142); `ADMIN` is excluded.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 27.1 (SD-135), Task 22.2 (SD-111)
SDISSUE_EOF
create_issue 5 '[Task 27.2] Verified email and self-service password reset' 'Module 5: Identity' 'backend,frontend,security,authentication,high-priority,epic:recovery-sessions' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Users see where they are signed in and can end sessions they do not recognise.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration adding session metadata (section 3); on creation record a coarse user-agent summary (browser family and major version, OS family, via a small parser, never the raw string beyond 200 characters), the IP prefix, country (if GeoIP is available), `device_id_hash`.
- Endpoints: `GET /api/me/sessions` (own, non-revoked, non-expired; marks the current one), `DELETE /api/me/sessions/{id}` (own only; another user's id returns `404`), `POST /api/me/sessions/revoke-others`; permission `sessions:manage-own`; step-up not required for ending sessions (safe direction), required for nothing here.
- Audit events `SESSION_REVOKED_BY_USER` with the target session id.
- Angular page `/account/sessions` with current-device highlight and "Sign out everywhere else".

📚 Source: backlog SD-137 (Epic 27) · provenance [DESIGN] [STANDARD] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE, FE)

### ✅ Acceptance Criteria

- [ ] A user lists only their own sessions; revoking another user's session id returns `404` (SEC-143).
- [ ] "Revoke others" keeps the current session and ends all others immediately; the revoked cookie fails at once (SEC-143).
- [ ] The list shows no token, digest or full IP address.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 21.3 (SD-106)
SDISSUE_EOF
create_issue 5 '[Task 27.3] Device sessions: list and revoke' 'Module 5: Identity' 'backend,frontend,authentication,high-priority,epic:recovery-sessions' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Tell users about security-relevant changes to their account, quietly and usefully.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Mail on: sign-in from a new device, password change or reset, passkey added or removed, TOTP enabled or disabled, recovery codes generated or used, SSO account linked, sessions revoked by an administrator.
- Trusted-device cookie `__Host-sd_device` (random 32 bytes, `HttpOnly`, `Secure`, `SameSite=Lax`, 180 days) stores only a hash in `login_contexts`; a "new device" is a context whose hash is unseen for that user; one mail per new device per day maximum.
- Mail content: event type, time (UTC), coarse place (country) and device summary, a link to the sessions page; never a link that performs an action, never secrets.
- Per-user preference to disable non-critical notices; critical ones (password change, factor changes, recovery code use) cannot be disabled.

📚 Source: backlog SD-138 (Epic 27) · provenance [DESIGN] [HARDENING] · priority P1

📏 Estimated size of issue: M (1-2 person-days, BE)

### ✅ Acceptance Criteria

- [ ] A first login from a new device sends one mail; the second login from the same device sends none (SEC-144).
- [ ] The trusted-device cookie value is not stored; only its hash is (SEC-144).
- [ ] Mail sending failure never fails or delays the login (SEC-145).
- [ ] Critical notices cannot be turned off.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 27.1 (SD-135), Task 27.3 (SD-137)
SDISSUE_EOF
create_issue 5 '[Task 27.4] Security notifications and trusted devices' 'Module 5: Identity' 'backend,authentication,medium-priority,epic:recovery-sessions' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Close the epic with the tests that matter most for recovery: enumeration, timing and token handling.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Statistical timing test (many samples, median comparison with a tolerance) for `forgot` across existing, unknown and blocked emails; documented as a smoke guard, not a proof.
- E2E: forgot password through Mailpit, reset, sign in with the new password, old sessions dead; sessions page revoke across two browser contexts.
- Update `docs/testing.md` (SEC-139 to SEC-145), `docs/architecture.md`, threat model, README feature list.
- Document the administrator procedure for `ADMIN` (outside self-service).

📚 Source: backlog SD-139 (Epic 27) · provenance [FOUNDATION] · priority P0

📏 Estimated size of issue: M (1-2 person-days, QA, Docs)

### ✅ Acceptance Criteria

- [ ] The E2E journeys pass three consecutive runs.
- [ ] No mail, log line or audit entry in the test run contains a token or password (scanner step over captured output).
- [ ] Docs updated and the traceability check is green.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 27.2 (SD-136), Task 27.3 (SD-137), Task 27.4 (SD-138)
SDISSUE_EOF
create_issue 5 '[Task 27.5] Tests, timing checks and documentation for recovery and sessions' 'Module 5: Identity' 'testing,documentation,authentication,high-priority,epic:recovery-sessions' "$BODY"

# ---- Epic 28: Adaptive Authentication ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Provide country-level location and basic network classification from an offline database, with no external calls. Later modules reuse this service.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `server/geo/geoip.ts` using `maxmind` to read a local MMDB (DB-IP Lite country or city, licence CC BY 4.0, attribution in the README and UI footer); path from `GEOIP_DB_PATH`; absent database means every lookup returns `{ country: null }` and a start-up warning, never an error.
- Script `npm run geoip:fetch` downloading the monthly file with checksum verification into `data/geoip/` (documented, never run in CI or tests).
- Test fixtures: a tiny synthetic MMDB generated at test time (`mmdb-lib` writer or a committed binary under 20 KB with a README on how it was made) mapping documentation address ranges (RFC 5737, RFC 3849) to fixed countries.
- Private, loopback and unspecified addresses return `{ country: null, kind: 'private' }`; the lookup is a pure function of the raw client address and never receives user data.
- Health endpoint shows GeoIP availability and database build date.

📚 Source: backlog SD-140 (Epic 28) · provenance [DESIGN] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE)

### ✅ Acceptance Criteria

- [ ] Fixture addresses resolve to the expected countries; private addresses resolve to `private`.
- [ ] With no database configured, lookups are neutral and the app starts (SEC-150).
- [ ] A lookup performs no network access (test with a network guard).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 22.1 (SD-110)
SDISSUE_EOF
create_issue 5 '[Task 28.1] GeoIP and network context service' 'Module 5: Identity' 'backend,authentication,high-priority,epic:adaptive-auth' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Remember, per user, the devices and countries seen at successful logins, as the baseline for risk decisions, with minimal personal data.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration `login_contexts` (section 3); upsert at every successful login (all methods) inside the session-creation transaction.
- Stores only: device hash, country, IP prefix (/24 or /48), first and last seen, count; no user agent, no raw IP (raw IP stays in the audit log).
- Query helpers: `isKnownDevice(userId, hash)`, `knownCountries(userId)`, `lastSuccessfulContext(userId)` (for travel speed), all with indexes on `(user_id, last_seen_at)`.
- Retention: rows older than the retention policy are removed by the maintenance job (180 days default, settable; the policy engine of SD-191 later takes over); the audit log is untouched.
- Cap of 50 contexts per user (oldest evicted) to bound storage.

📚 Source: backlog SD-141 (Epic 28) · provenance [DESIGN] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] A successful login by any method upserts exactly one context row; a failed login writes none.
- [ ] The table contains no raw IP address, user agent or token (schema test).
- [ ] The retention job removes expired contexts and never touches `audit_log` (SEC-78 still holds).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 28.1 (SD-140), Task 27.4 (SD-138)
SDISSUE_EOF
create_issue 5 '[Task 28.2] Login context history' 'Module 5: Identity' 'backend,database,security,authentication,high-priority,epic:adaptive-auth' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

A deterministic, explainable function from signals to a score and a level, with no side effects, so it can be unit tested exhaustively and later reused by playbooks.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `server/risk/engine.ts`: `evaluate(context, history, policy, now) -> { score: 0..100, level: 'LOW'|'MEDIUM'|'HIGH', reasons: Reason[] }` where each `Reason` is `{ code, weight }`.
- Signals and default weights: new device (+25), new country (+30), impossible travel (+60: great-circle distance between the previous and current country centroids divided by elapsed time above 900 km/h, only when both countries are known and the elapsed time is under 12 hours), burst of failed attempts on the account in the last 10 minutes (+20), address flagged by reputation (+30, effective once SD-147 exists), first login of an account (no history: neutral, 0), unusual hour (+0 default, tunable; off by default to avoid bias). Weights capped by the policy; the sum is clamped to 100.
- Thresholds from policy: MEDIUM at 40, HIGH at 70 (defaults).
- Country centroid table committed as a small JSON (ISO 3166-1 alpha-2 to latitude and longitude); unknown countries disable the travel signal.
- Exhaustive table-driven tests with the fake clock; property test that scores are monotone in added signals.

📚 Source: backlog SD-142 (Epic 28) · provenance [DESIGN] [HARDENING] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] A new device alone scores MEDIUM only if the policy threshold says so; new device plus new country in under 30 minutes at implausible distance scores HIGH (SEC-146, SEC-147).
- [ ] Missing GeoIP data produces a neutral country signal and never a denial (SEC-150).
- [ ] `reasons` lists every contributing signal with its weight; the output is stable for identical input.
- [ ] The engine imports no database, clock or network module (lint boundary rule).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 28.2 (SD-141), Task 28.1 (SD-140)
SDISSUE_EOF
create_issue 5 '[Task 28.3] Risk engine' 'Module 5: Identity' 'backend,security,authentication,high-priority,epic:adaptive-auth' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Apply the risk decision after the credentials verify and before the session is created, without leaking the reason to an attacker.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Insert the decision into `auth/login-service.ts` (password), the passkey login and the OIDC callback, after credential verification, before session creation.
- Policy outcomes: LOW creates the session; MEDIUM requires a second factor: if the user has TOTP or a passkey the login stops at the restricted TOTP or passkey stage, otherwise the login proceeds, the session is marked `elevated_risk`, sensitive routes require step-up (SD-127), and the user is notified (SD-138); HIGH refuses with the **existing generic invalid-credentials envelope** and status, records an audit entry with score and reason codes, raises a security event `RISK_LOGIN_DENIED` (severity HIGH) and counts a failure toward the address limit but not the account lock (avoid weaponising risk to lock victims out, D5-05).
- Protected `ADMIN`: never hard-denied; HIGH forces step-up with an enrolled factor, otherwise creates a CRITICAL alert and allows the login (prevents permanent self-lockout; the break-glass CLI remains), D5-06.
- A passkey login with user verification lowers MEDIUM to LOW (a phishing-resistant factor was already presented) but never lowers HIGH.
- Responses and timing for HIGH match a wrong password; the reason appears only in the audit entry and the security event.
- Feature flag in policy (`risk_enabled`, default off) so existing behaviour and tests are unchanged until enabled.

📚 Source: backlog SD-143 (Epic 28) · provenance [HARDENING] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] A HIGH-risk login with the correct password returns the same status, body and similar timing as a wrong password and creates the audit entry and event (SEC-148).
- [ ] A MEDIUM login with TOTP enrolled demands the code; without any factor it proceeds in an elevated session (SEC-149).
- [ ] `ADMIN` is never hard-denied by risk (SEC-151).
- [ ] With `risk_enabled = false`, no behaviour changes (all earlier tests pass).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 28.3 (SD-142), Task 25.4 (SD-127), Task 25.3 (SD-126)
SDISSUE_EOF
create_issue 5 '[Task 28.4] Enforcement in the login pipeline' 'Module 5: Identity' 'backend,security,authentication,high-priority,epic:adaptive-auth' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

One administrator page for authentication policy, and clear explanations of every risk decision.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `GET/PUT /api/admin/auth-policy` (permissions `auth-policy:read` and `auth-policy:update`, step-up required, strict schema with ranges): `mfa_required_roles`, `step_up_max_age_minutes`, `risk_enabled`, thresholds, signal weights, `oidc_jit_provisioning`, `oidc_link_by_verified_email`, `oidc_role_mapping`; one audit entry per change with old and new values (SEC-70 pattern).
- Angular page `/admin/auth-policy`: grouped forms, validation mirroring the server, a "simulate" panel that runs the pure risk engine on sample inputs via a read-only endpoint and shows the score breakdown.
- Audit drawer and security-events view show the risk score and reason codes for denied and stepped-up logins, and **country only**, never coordinates.
- Per-user view (administrator): known device count and countries, with a "forget contexts" action (audited).

📚 Source: backlog SD-144 (Epic 28) · provenance [DESIGN] · priority P1

📏 Estimated size of issue: M (1-2 person-days, FE, BE)

### ✅ Acceptance Criteria

- [ ] Only the Administrator can read or change the policy; values outside range are refused; each change writes one audit entry (SEC-152).
- [ ] The simulate endpoint changes no state and returns the same breakdown as production decisions.
- [ ] Risk reasons appear in the audit drawer and the events list; no precise location is shown or stored (SEC-152).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 28.4 (SD-143), Task 25.4 (SD-127), Task 26.3 (SD-132)
SDISSUE_EOF
create_issue 5 '[Task 28.5] Policy administration, explainability and the OIDC and MFA settings page' 'Module 5: Identity' 'frontend,backend,authentication,medium-priority,epic:adaptive-auth' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Close the module with an end-to-end proof and updated documentation.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-5.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Journeys: register a passkey, sign in with it, require MFA for managers and watch a manager be forced to enrol; SSO login through Keycloak; forgot and reset password through Mailpit; sessions page; risk journey using `RISK_TEST_HEADERS` to simulate a new country and an impossible-travel HIGH login.
- Add SEC-119 to SEC-153 to `docs/testing.md` and the ASVS mapping (SD-122); extend `docs/architecture.md`, `docs/permissions.md`, `docs/database-schema.md`, the threat model and the README feature list.
- Update the demo recording with the passkey and SSO journeys (optional).

📚 Source: backlog SD-145 (Epic 28) · provenance [FOUNDATION] · priority P0

📏 Estimated size of issue: M (1-2 person-days, QA, Docs)

### ✅ Acceptance Criteria

- [ ] All E2E journeys pass three consecutive runs on CI.
- [ ] SEC-119 to SEC-153 map to real test titles; the traceability and ASVS checks are green.
- [ ] Docs describe every method, the session model and the recovery story.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

all P0 tasks of Module 5
SDISSUE_EOF
create_issue 5 '[Task 28.6] Module 5 verification, E2E journey, documentation' 'Module 5: Identity' 'testing,documentation,authentication,high-priority,epic:adaptive-auth' "$BODY"

# ---- Epic 29: Threat Intelligence and ATT&CK ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Attach context (country, reputation) to security events when they are created, without ever slowing or failing the request that caused them.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration adding `enrichment jsonb` and `attack_techniques text[]` to `security_events`; DTOs in `security/schemas.ts` expose both (country and list names only; no coordinates).
- `server/intel/enrich.ts`: `enrich({ ip })` returns `{ geo: { country }, reputation: { lists: string[] } }` from local sources only (SD-140 GeoIP and SD-147 tables); called inside the event write in `security/events.ts`, bounded by a 50 ms budget; on timeout or error store `{}` and count a metric.
- Remote enrichment (AbuseIPDB, SD-147) happens afterwards in a background worker that updates `enrichment` by event id, never in the request path.
- Enrichment is **not** written to `audit_log` (chain stays small and personal data minimal), D6-05.
- Update the admin security-events DTO, the Angular list and detail (country flag text, list badges).

📚 Source: backlog SD-146 (Epic 29) · provenance [DESIGN] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE)

### ✅ Acceptance Criteria

- [ ] An event from a fixture address in the GeoIP database stores the expected country; a private address stores none (SEC-154).
- [ ] A throwing or slow enricher cannot delay or fail the request that raised the event (SEC-154).
- [ ] No audit entry contains enrichment fields (schema test).
- [ ] The security-events API never returns coordinates.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 28.1 (SD-140), Task 21.3 (SD-106)
SDISSUE_EOF
create_issue 6 '[Task 29.1] Security event enrichment pipeline' 'Module 6: Detection and Response' 'backend,security,monitoring,high-priority,epic:threat-intel' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Know when traffic comes from a Tor exit node, a known-bad network or an abusive address, using public lists downloaded safely and matched in the database.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration for `ip_reputation_lists` and `ip_reputation_entries` (section 3) with a GiST index; seed list rows (Tor bulk exit list, Spamhaus DROP, FireHOL level 1), each `enabled = false`; permissions `intel:read` and `intel:manage` in the matrix and docs.
- Updater job (`npm run intel:update` and a scheduled worker, only when `INTEL_FEEDS_ENABLED=true`): fetch through the shared SSRF-guarded HTTP client (HTTPS only, 5 s connect, 20 s total, size cap `INTEL_FEED_MAX_BYTES`, content type `text/plain`), parse line-based, validate each CIDR, skip comments, reject the update if more than 1% of lines are invalid or the list shrinks by more than 50% (sanity gate), then replace the list's entries in one transaction.
- Lookup `reputationFor(ip)` using `cidr >>= $1::inet` (IPv4 and IPv6); private, loopback and the configured trusted proxy addresses are never reported.
- AbuseIPDB (optional): key from `ABUSEIPDB_API_KEY`, request only when the address appears in a HIGH-severity event, cache 24 hours in Redis, respect `ABUSEIPDB_DAILY_BUDGET`, key never logged, outage returns neutral.
- Reputation is a **signal** (risk engine weight, event badge), not a block; blocking stays a playbook decision (SD-157).

📚 Source: backlog SD-147 (Epic 29) · provenance [HARDENING] · priority P1

📏 Estimated size of issue: L (3-5 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] Fixture feeds served by a local stub load and match IPv4 and IPv6 CIDRs; private and own addresses never match (SEC-155).
- [ ] A truncated, oversized, malformed or 70%-shrunk download leaves the previous entries untouched (SEC-155).
- [ ] With the default configuration no network request is made (network-guard test); AbuseIPDB is inert without a key and respects the daily budget and cache (SEC-156).
- [ ] The API key never appears in logs, errors or DTOs.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 29.1 (SD-146), Task 23.4 (SD-117) (SSRF guard)
SDISSUE_EOF
create_issue 6 '[Task 29.2] IP reputation feeds and optional AbuseIPDB' 'Module 6: Detection and Response' 'backend,database,security,monitoring,medium-priority,epic:threat-intel' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Classify detections in the common vocabulary, and make it impossible to add a rule without a classification.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Commit a pinned subset of the ATT&CK Enterprise dataset as `apps/backend/src/server/intel/attack-techniques.json` (technique ID, name, tactic IDs, and the dataset version and date in the header), generated by a script `npm run intel:attack:update` from the official STIX bundle; the update script is manual and never run in tests.
- Each rule module under `server/detection/rules/` exports `attack: string[]`; a registry `event-attack-map.ts` maps security event types and audit actions that are not rule-driven.
- Initial mapping to confirm against the pinned dataset (each entry reviewed): failed-login burst and account lock to Brute Force (T1110); password spraying to T1110.003; credential stuffing to T1110.004; success after failures and risk-based impossible travel to Valid Accounts (T1078); trap account and honeytoken use to Valid Accounts (T1078) with deception noted; audit tamper detection to Indicator Removal (T1070) and Stored Data Manipulation (T1565.001); webhook secret probing to Exploit Public-Facing Application (T1190).
- Tests: every rule exports at least one ID; every ID exists in the dataset; every event type either has a mapping or is explicitly listed as unmapped with a reason; adding a rule without `attack` fails the test.
- Security events store `attack_techniques` at creation; the UI shows technique chips linking to the official page (static URL built from the ID, not from stored text).

📚 Source: backlog SD-148 (Epic 29) · provenance [STANDARD] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE, Docs)

### ✅ Acceptance Criteria

- [ ] Removing the `attack` export from a rule fails the test suite (SEC-157).
- [ ] An ID that is not in the pinned dataset fails the test suite (SEC-157).
- [ ] Events created by the two existing rules carry the expected technique IDs.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 29.1 (SD-146)
SDISSUE_EOF
create_issue 6 '[Task 29.3] MITRE ATT&CK mapping for every rule and event type' 'Module 6: Detection and Response' 'backend,documentation,monitoring,high-priority,epic:threat-intel' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Show what SecureDesk can detect, and what it has seen, on one page.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `GET /api/admin/attack-coverage`: tactics in matrix order, techniques with `coveredBy` (rule and event-type IDs) and `count30d` (events with that technique in the last 30 days); permission `intel:read`.
- `GET /api/admin/attack-coverage/navigator-layer`: JSON in ATT&CK Navigator layer format (version pinned in the code), with covered techniques scored 1 and observed ones scored by count bucket, no personal data.
- Angular page `/admin/attack-coverage`: matrix grid (covered, observed, uncovered), filter by tactic, click a technique to list the rules and recent events, download button for the layer.
- Documentation of how to import the layer into the public Navigator.

📚 Source: backlog SD-149 (Epic 29) · provenance [PORTFOLIO] · priority P1

📏 Estimated size of issue: M (1-2 person-days, FE, BE)

### ✅ Acceptance Criteria

- [ ] Only users with `intel:read` can read the page and the layer; other roles get `403`, anonymous `401` (SEC-158).
- [ ] The exported layer validates against the Navigator layer schema (fixture test) and contains no event content.
- [ ] The page shows the two existing rules as covering their techniques.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 29.3 (SD-148)
SDISSUE_EOF
create_issue 6 '[Task 29.4] ATT&CK coverage page and Navigator layer export' 'Module 6: Detection and Response' 'frontend,backend,monitoring,medium-priority,epic:threat-intel' "$BODY"

# ---- Epic 30: Incident Case Management ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Create the storage and rules for incidents before any API or UI.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration for `incidents`, `incident_links`, `incident_notes`, `incident_note_revisions` (section 3); human number from a database sequence formatted as `INC-0001`; CHECK constraints for severity (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) and status (`NEW`, `TRIAGED`, `INVESTIGATING`, `CONTAINED`, `RESOLVED`, `CLOSED`, `FALSE_POSITIVE`).
- Permissions `incidents:read`, `incidents:manage`, `incidents:export` in `codes.ts`, `matrix.ts`, `docs/permissions.md`, and the doc-sync test.
- Audit catalogue entries (closed list, strict details with ids only): `INCIDENT_CREATED`, `INCIDENT_STATUS_CHANGED`, `INCIDENT_ASSIGNED`, `INCIDENT_LINK_ADDED`, `INCIDENT_LINK_REMOVED`, `INCIDENT_NOTE_ADDED`, `INCIDENT_NOTE_EDITED`, `INCIDENT_EXPORTED`. **Note text is never copied into the audit log.**
- No `UPDATE` of a note body in place: edits insert a revision; no `DELETE` route or privilege on notes and revisions (privileges and a guard test).
- Update `docs/database-schema.md`, the ER diagram test.

📚 Source: backlog SD-150 (Epic 30) · provenance [DESIGN] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] Migration applies to an empty database and one with existing events; the ER diagram test passes.
- [ ] The application role has no `DELETE` on `incident_notes` or `incident_note_revisions` (SEC-162).
- [ ] `matrix.test.ts` proves the new permissions are held by exactly the roles of section 4.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 21.4 (SD-107)
SDISSUE_EOF
create_issue 6 '[Task 30.1] Incident data model, numbering and permissions' 'Module 6: Detection and Response' 'backend,database,monitoring,high-priority,epic:incidents' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Add the role Module 3 anticipated: a person who can inspect and verify, and change nothing.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `ROLES.AUDITOR = 'auditor'`; seed the role, its permissions (section 4) and a demo account `auditor1`; migration for the role row; `docs/permissions.md` role table.
- Backend: the Auditor reads the audit log, exports, verifies, proofs, security events, IP blocks, intel, incidents, playbooks; no acknowledgement, unlock, clear, create or update permission anywhere; no ticket access (all ticket routes `403`, like Administrator).
- Conformance test: iterate the route registry (SD-114); for every route with a non-`GET` method, the Auditor receives `403` (or `401` for anonymous); `GET` routes outside the Auditor's permissions receive `403`.
- Frontend: navigation shows only permitted entries; action buttons (acknowledge, unlock, edit) hidden through the permission directive; backend remains the authority.
- User administration: the Administrator can assign the role; protected `ADMIN` cannot become an Auditor.

📚 Source: backlog SD-151 (Epic 30) · provenance [DESIGN] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE, FE)

### ✅ Acceptance Criteria

- [ ] The conformance test passes: no mutating route allows the Auditor (SEC-163).
- [ ] The Auditor can read, export and verify the audit log and sees incidents read-only (SEC-163).
- [ ] Every ticket route answers the Auditor with `403` (SEC-164).
- [ ] The documented permission matrix and the code agree (doc-sync test).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 30.1 (SD-150)
SDISSUE_EOF
create_issue 6 '[Task 30.2] Auditor role (read-only)' 'Module 6: Detection and Response' 'backend,frontend,security,monitoring,high-priority,epic:incidents' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Create, investigate and close incidents through a state machine, with automatic creation from critical alerts.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Routes in section 5.1; strict schemas; title 1 to 120 and note 1 to 4000 characters, sanitised for display; severity defaults from the triggering alert.
- State machine in `server/incidents/transitions.ts`: allowed moves `NEW→TRIAGED→INVESTIGATING→CONTAINED→RESOLVED→CLOSED`, plus `FALSE_POSITIVE` from any open state and reopen from `RESOLVED`; `RESOLVED` and `CLOSED` require a resolution text; others return `409 INCIDENT_TRANSITION_INVALID` (SEC-159).
- Links: only existing security event IDs and audit sequence ranges (`from ≤ to`, within the existing log, at most 10,000 entries per range); linking twice is idempotent (SEC-160).
- Auto-open: a cursor-based consumer (D6-04) opens an incident for each new `CRITICAL` `DETECTION_ALERT` when `incident_auto_open_min_severity` allows; dedupe: if an open incident has the same `subject_ref` and rule within 1 hour, append the event as a link instead (SEC-161).
- Every change is a state change with an audit entry in the same transaction (fail closed).
- Assignment only to an active user holding `incidents:manage`.

📚 Source: backlog SD-152 (Epic 30) · provenance [DESIGN] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] Invalid transitions and missing resolution texts are refused; the table in the doc matches the code (SEC-159).
- [ ] Links to unknown events or invalid ranges are refused; a duplicate link changes nothing (SEC-160).
- [ ] Two critical alerts for the same subject and rule within an hour yield one incident with two linked events (SEC-161).
- [ ] Audit entries contain ids and states, never note or resolution text (SEC-166).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 30.1 (SD-150), Task 30.2 (SD-151)
SDISSUE_EOF
create_issue 6 '[Task 30.3] Incident lifecycle API' 'Module 6: Detection and Response' 'backend,security,monitoring,high-priority,epic:incidents' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

An analyst's workspace: list, filter, open a case, see everything that happened in order.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Angular routes `/admin/incidents` (filters: status, severity, owner, date, technique) and `/admin/incidents/:id`.
- Detail: header with status control (only legal next states offered), owner picker, linked events with ATT&CK chips and enrichment, audit ranges expandable to the entries (reusing the audit table component), notes with revision history, and a **merged timeline** built server-side from: incident audit entries, linked security events, linked audit entries, notes, playbook runs.
- "Open incident" button on security events and on audit-drawer alerts; the Auditor sees everything read-only (permission directive).
- Plain-text rendering everywhere (interpolation only, no unsafe HTML); keyboard-accessible controls; component tests for state transitions and read-only mode.

📚 Source: backlog SD-153 (Epic 30) · provenance [PORTFOLIO] · priority P1

📏 Estimated size of issue: L (3-5 person-days, FE)

### ✅ Acceptance Criteria

- [ ] The timeline shows items from all sources in chronological order with source labels.
- [ ] The Auditor sees no editing controls and the backend refuses attempts (SEC-163).
- [ ] Note text containing markup renders as text (extends SEC-26).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 30.3 (SD-152)
SDISSUE_EOF
create_issue 6 '[Task 30.4] Incident UI with merged timeline' 'Module 6: Detection and Response' 'frontend,monitoring,medium-priority,epic:incidents' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Produce a self-contained, tamper-evident package that an auditor can verify without the application.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `POST /api/admin/incidents/{id}/evidence` (permission `incidents:export`, step-up required) builds a ZIP in memory (size cap 50 MB): `incident.json` (incident, links, notes without author secrets), `audit-entries.jsonl` (the linked entries with their hashes), `events.json` (linked security events, DTO-safe), `verification.json` (chain verification result and, once available, inclusion proofs and the latest checkpoint), `manifest.json` (SHA-256 of every file, generation time UTC, application version), and `manifest.sig` (Ed25519 detached signature with `INCIDENT_SIGNING_KEY_PATH`'s key; the public key is shown on `docs/` and in the bundle).
- The export audit entry (`INCIDENT_EXPORTED`) is written **before** data is sent (SEC-81 pattern) and records the incident id, byte size and file count.
- A standalone script `tools/audit-verifier/verify-bundle.mjs` checks the manifest hashes and the signature using only Node's built-in crypto; SD-165 later builds the full log verifier on the same module.
- CSV or spreadsheet formats are not offered here, so no formula-injection surface exists.

📚 Source: backlog SD-154 (Epic 30) · provenance [STANDARD] · priority P1

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] The manifest hashes match the files and the signature verifies with the published public key (SEC-165).
- [ ] Altering any file or the manifest makes the verifier fail naming the file (SEC-165).
- [ ] The export entry exists before the response body is sent; a failing audit write blocks the export.
- [ ] A missing or world-readable signing key file refuses export and start-up in production.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 30.3 (SD-152), Task 32.2 (SD-163) (shared signing code)
SDISSUE_EOF
create_issue 6 '[Task 30.5] Signed evidence bundle export' 'Module 6: Detection and Response' 'backend,security,monitoring,medium-priority,epic:incidents' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Measure response (time to detect and time to resolve) and close the epic.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Metrics endpoint for the UI: mean time to detect (event time to incident opened), mean time to resolve (opened to resolved), counts by severity and status, last 30 and 90 days; computed in SQL, tested with the fake clock (SEC-167).
- Prometheus metrics added to SD-121's set: `incidents_open{severity}`, `incident_mttr_seconds` histogram.
- E2E: an attack (bot-sim) raises a critical alert, an incident opens automatically, an administrator investigates, links the audit range, resolves, exports the bundle and the verifier accepts it; the Auditor sees it read-only.
- Update `docs/testing.md`, `docs/permissions.md`, the threat model, `docs/incidents.md` (workflow, states, evidence verification).

📚 Source: backlog SD-155 (Epic 30) · provenance [DESIGN] · priority P1

📏 Estimated size of issue: M (1-2 person-days, BE, QA, Docs)

### ✅ Acceptance Criteria

- [ ] MTTD and MTTR match hand-computed values on a fixture (SEC-167).
- [ ] The E2E journey passes three consecutive runs.
- [ ] `docs/incidents.md` documents the state machine and the verification command.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 30.3 (SD-152), Task 30.4 (SD-153)
SDISSUE_EOF
create_issue 6 '[Task 30.6] Incident metrics, tests and documentation' 'Module 6: Detection and Response' 'backend,testing,documentation,monitoring,medium-priority,epic:incidents' "$BODY"

# ---- Epic 31: SOAR-lite Playbooks ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Describe responses as validated data with no way to run arbitrary code.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

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

📚 Source: backlog SD-156 (Epic 31) · provenance [DESIGN] [HARDENING] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] Unknown actions, unknown fields, oversized definitions and secret-looking keys are refused (SEC-168).
- [ ] `AUTO` with an account-affecting step is refused at save (SEC-168).
- [ ] Editing creates a new version and keeps the previous one; runs reference the version they used.
- [ ] Only the Administrator holds `playbooks:manage` and `playbooks:approve` (SEC-176).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 29.3 (SD-148), Task 30.3 (SD-152)
SDISSUE_EOF
create_issue 6 '[Task 31.1] Playbook model, strict definition schema and permissions' 'Module 6: Detection and Response' 'backend,database,security,monitoring,high-priority,epic:soar' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Implement the actions as thin, typed, idempotent wrappers over existing services, each with its own safety checks.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Actions and their targets (derived from the **trigger event**, never from free text): `BLOCK_IP` (ip-block service, TTL 1 to 1,440 minutes), `LOCK_ACCOUNT` (existing temporary lock), `BLOCK_USER` (administrative block, always approval), `REVOKE_USER_SESSIONS`, `FORCE_PASSWORD_RESET` (sets `must_change_password` and revokes sessions), `NOTIFY_WEBHOOK` (configured `ALERT_WEBHOOK_URL` only, existing dispatcher), `SEND_EMAIL` (to active Administrators through the mail service), `OPEN_INCIDENT`, `ADD_NOTE`.
- Guard rails in `server/soar/guards.ts`: never act on the protected `ADMIN` account; never block loopback, private, link-local, the trusted-proxy addresses or anything in `SOAR_NEVER_BLOCK_CIDRS`; never block an address that has an active full session of an Administrator within the last 30 minutes; global cap `SOAR_MAX_ACTIONS_PER_HOUR` after which the circuit breaker trips, further actions are refused and a CRITICAL alert is raised once per hour.
- Idempotent: performing an action that is already in effect succeeds as a no-op with `result_class = ALREADY_APPLIED`.
- Where an undo exists (`BLOCK_IP`, `LOCK_ACCOUNT`) the run step records how to undo it, and the UI offers it (audited).
- Each action writes its own audit entry (`SOAR_ACTION_EXECUTED` with action, target reference, run id, result class; no secrets, no message bodies) in the same transaction as its effect.

📚 Source: backlog SD-157 (Epic 31) · provenance [HARDENING] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] `ADMIN`, loopback, private, proxy and allowlisted addresses are never targeted, even when the event names them (SEC-172).
- [ ] After the hourly cap, further actions are refused and exactly one CRITICAL alert is raised (SEC-172).
- [ ] Repeating an action reports `ALREADY_APPLIED` and changes nothing.
- [ ] `NOTIFY_WEBHOOK` can only reach the configured destination (SEC-175).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 31.1 (SD-156), Task 27.1 (SD-135)
SDISSUE_EOF
create_issue 6 '[Task 31.2] Action library with guard rails' 'Module 6: Detection and Response' 'backend,security,monitoring,high-priority,epic:soar' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Run matching playbooks reliably: exactly once per trigger, resumable after a crash, stoppable at any time.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Trigger intake: a persisted cursor over `security_events` (D6-04); a worker polls every 2 seconds and the event bus nudges it immediately; for each new event find enabled playbooks whose trigger and conditions match.
- Create a `playbook_runs` row with `idempotency_key = playbook_id:version:event_id` (unique), so duplicates and restarts never double-run; per-playbook-and-subject cooldown from the definition.
- Step executor: sequential steps with per-step timeout (10 s), retries for transient failures only (2 attempts), the status of every step persisted before and after; on crash the next worker resumes at the first non-finished step and never repeats a finished one (SEC-174).
- Mode handling: `DRY_RUN` records what each step would do and executes nothing (SEC-169); `APPROVAL` creates a pending approval before the first account-affecting step (SD-159); `AUTO` runs containment steps only.
- Kill switch `soar_enabled` (default **off** until enabled): checked before every step; turning it off stops runs at the next step boundary and marks them `ABORTED` (SEC-173).
- Metrics: runs by status, step durations, queue lag; alert `SOAR_LAG` when the cursor lags more than five minutes.

📚 Source: backlog SD-158 (Epic 31) · provenance [DESIGN] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] The same event delivered twice, or a worker restart, produces one run and no repeated finished step (SEC-174).
- [ ] A `DRY_RUN` playbook changes nothing but records its plan (SEC-169).
- [ ] Switching the kill switch off during a run stops it at the next step (SEC-173).
- [ ] An attack through the bot simulator leads to a `BLOCK_IP` run within five seconds and a second alert inside the cooldown starts no new run (SEC-171).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 31.2 (SD-157), Task 22.4 (SD-113)
SDISSUE_EOF
create_issue 6 '[Task 31.3] Execution engine with durable runs' 'Module 6: Detection and Response' 'backend,database,monitoring,high-priority,epic:soar' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Let a human decide before access-changing actions, with optional four-eyes control.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- A pending approval records the planned step, target reference and the evidence (event and incident links); expires after `approval_ttl_minutes` (default 60, range 5 to 1,440), then the run ends `EXPIRED` (SEC-170).
- `POST /api/admin/playbook-approvals/{id}/decision` (permission `playbooks:approve`, step-up required): approve executes the step once, reject ends the run; deciding twice or after expiry returns `409` (`APPROVAL_EXPIRED`).
- Setting `soar_four_eyes` (default off): the approver must differ from the administrator who last edited the playbook (`403 APPROVAL_SAME_ACTOR`, SEC-170).
- Notification mail to administrators on a new pending approval (mail service) and a banner entry in the admin UI; no secrets in the message.
- Audit entries `SOAR_APPROVAL_REQUESTED`, `SOAR_APPROVAL_DECIDED`.

📚 Source: backlog SD-159 (Epic 31) · provenance [HARDENING] · priority P1

📏 Estimated size of issue: M (1-2 person-days, BE)

### ✅ Acceptance Criteria

- [ ] Approve executes exactly once; reject and expiry execute nothing (SEC-170).
- [ ] With four-eyes on, the editing administrator cannot approve their own playbook's step (SEC-170).
- [ ] Deciding twice or after expiry is refused.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 31.3 (SD-158)
SDISSUE_EOF
create_issue 6 '[Task 31.4] Approval workflow' 'Module 6: Detection and Response' 'backend,security,monitoring,medium-priority,epic:soar' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Operate playbooks without editing JSON by hand, and see what a playbook **would have done** before enabling it.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Angular `/admin/playbooks`: form-based editor generated from the definition schema (no free-text expression field), mode switch with a confirmation dialog that explains the consequences, enable toggle, the global kill switch with a visible state in the app shell.
- Run history with step results and undo buttons where available; approvals inbox with evidence and Approve and Reject buttons.
- `POST /api/admin/playbooks/{id}/simulate`: replays the last N (at most 500) security events through the **pure matcher** and returns which would have triggered and which steps would have run, with the guard-rail decisions; changes nothing (SEC-169).
- Auditor sees all read-only.

📚 Source: backlog SD-160 (Epic 31) · provenance [PORTFOLIO] · priority P1

📏 Estimated size of issue: L (3-5 person-days, FE, BE)

### ✅ Acceptance Criteria

- [ ] The simulator reports matches and guard-rail refusals for historical events and writes no run, action or audit mutation other than its own read record (SEC-169).
- [ ] The editor cannot produce an invalid definition (form validation mirrors the schema; the server still validates).
- [ ] The kill switch state is visible on every admin page.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 31.3 (SD-158), Task 31.4 (SD-159)
SDISSUE_EOF
create_issue 6 '[Task 31.5] Playbook UI, run history and the historical simulator' 'Module 6: Detection and Response' 'frontend,backend,monitoring,medium-priority,epic:soar' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Prove the whole loop and the safeguards, and document the operating model.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Integration test chain: bot-sim spraying, alert, playbook `BLOCK_IP` plus `OPEN_INCIDENT`, address blocked, incident exists with the run linked (SEC-177).
- Safeguard tests: protected `ADMIN`, private address, hourly cap, kill switch, duplicate delivery, crash resume, SSRF on `NOTIFY_WEBHOOK`.
- E2E: an administrator creates a playbook in dry-run, simulates, switches to auto, watches a run, undoes the block.
- `docs/soar.md`: model, schema reference, action catalogue with guard rails, approval and four-eyes, kill switch and break-glass (`npm run admin:unlock`), threat discussion.
- Update `docs/testing.md`, `docs/permissions.md`, threat model, ASVS mapping.

📚 Source: backlog SD-161 (Epic 31) · provenance [FOUNDATION] · priority P0

📏 Estimated size of issue: M (1-2 person-days, QA, Docs)

### ✅ Acceptance Criteria

- [ ] The bot-sim end-to-end chain passes three consecutive runs.
- [ ] Every safeguard has a SEC-titled test.
- [ ] `docs/soar.md` explains why account-affecting actions cannot run unattended.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 31.3 (SD-158), Task 31.4 (SD-159), Task 31.5 (SD-160)
SDISSUE_EOF
create_issue 6 '[Task 31.6] SOAR end-to-end tests, safeguards and documentation' 'Module 6: Detection and Response' 'testing,documentation,monitoring,high-priority,epic:soar' "$BODY"

# ---- Epic 32: Merkle Audit Log and Witness ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Add logarithmic inclusion and consistency proofs on top of the existing chain, without changing the chain.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `server/audit/merkle.ts` implementing RFC 6962 hashing: leaf hash `SHA-256(0x00 || entry_hash_bytes)` where `entry_hash` is the existing chain hash, node hash `SHA-256(0x01 || left || right)`; root of a tree of `n` leaves by the RFC's recursive split at the largest power of two below `n`.
- Incremental builder: `audit_merkle_nodes (level, idx, hash)` stores completed subtree hashes; appending leaf `n` needs `O(log n)` reads and writes; the builder runs as a background worker from a persisted cursor (it reads new entries in `seq` order), so the hot append path is unchanged; lag is a metric.
- Proof generation: `inclusionProof(seq, treeSize)` and `consistencyProof(oldSize, newSize)` returning arrays of hashes, plus pure verification functions `verifyInclusion` and `verifyConsistency` with no database dependency (reused by the standalone verifier).
- `audit_merkle_nodes` is append-only (trigger plus no `UPDATE`, `DELETE` for the app role), like the log itself.
- Test vectors: the RFC 6962 reference examples (a published 8-leaf tree) and cross-check against a naive recursive implementation in the test only.

📚 Source: backlog SD-162 (Epic 32) · provenance [STANDARD] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] Roots, inclusion proofs and consistency proofs match the reference vectors and the naive implementation for every tree size from 1 to 130 (SEC-178).
- [ ] For a 1,000-entry log every entry has a verifying inclusion proof; changing one leaf makes its proof fail (SEC-179).
- [ ] A consistency proof between two sizes verifies; one taken from a rewritten history fails (SEC-180).
- [ ] The builder resumes after a restart without gaps or duplicate nodes.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 21.4 (SD-107)
SDISSUE_EOF
create_issue 6 '[Task 32.1] Merkle tree over the audit entries' 'Module 6: Detection and Response' 'backend,database,security,monitoring,high-priority,epic:merkle-audit' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Periodically commit to the whole log state with a signature made by a key the database administrator does not hold.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Checkpoint format following the C2SP checkpoint and signed-note conventions: text body `securedesk-audit\n<tree size>\n<base64 root>\n<UTC timestamp>\n`, then a blank line and one or more `— <key name> <base64 signature>` lines; Ed25519 (RFC 8032); `key_id` is the first four bytes of the SHA-256 of the public key.
- `server/crypto/signing.ts` loads `AUDIT_SIGNING_KEY_PATH` (PEM, PKCS#8, Ed25519): refuses a missing file in production, a mode other than `0600`, a path under the data or any served directory (reuse `security/private-file.ts` from SD-79's work), and logs only the key ID. The key is never in the database, logs, exports or environment values.
- A worker writes a checkpoint every `AUDIT_CHECKPOINT_EVERY_ENTRIES` entries or `AUDIT_CHECKPOINT_EVERY_MINUTES`, whichever comes first, after the builder has covered the tree size; `audit_checkpoints` is append-only; each checkpoint is itself audited as `AUDIT_CHECKPOINT_CREATED` (this entry lands in a later checkpoint, by design).
- Key rotation procedure: `npm run audit:key:rotate` generates a new key, writes a **rotation checkpoint** signed by both the old and the new key, and records the new public key in `docs/audit-keys.md` and the repository; verification accepts any key in the published key list.
- `GET /api/admin/audit-log/checkpoints` (permission `audit-log:proof`) lists them with their signatures and the public keys.

📚 Source: backlog SD-163 (Epic 32) · provenance [STANDARD] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] Signatures verify; altering size, root or time fails verification (SEC-181).
- [ ] A rotation checkpoint carries both signatures, and checkpoints signed by the old key still verify after rotation (SEC-181).
- [ ] The private key is never found in the database, logs or API output; start-up refuses a world-readable key file in production (SEC-187).
- [ ] The checkpoint worker is idempotent across restarts (no duplicate sizes).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 32.1 (SD-162)
SDISSUE_EOF
create_issue 6 '[Task 32.2] Signed checkpoints and key management' 'Module 6: Detection and Response' 'backend,security,monitoring,high-priority,epic:merkle-audit' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Make a rewrite of the entire log detectable by giving the world a copy of each checkpoint that the host administrator cannot alter.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `interface WitnessPublisher { publish(checkpoint, consistencyProof): Promise<Receipt> }` with implementations: **FilePublisher** (append-only JSONL at `AUDIT_PUBLISH_FILE_PATH`, default for tests and the demo), **HttpWitnessPublisher** (our own witness service), **Rfc3161Publisher** (timestamp token from a TSA at `AUDIT_TSA_URL`), and an optional **GitPublisher** (commit of the checkpoint text to a dedicated repository through the GitHub API with a fine-grained token, off by default).
- Independent witness service `tools/witness/` (small Node server, its own Dockerfile and compose profile `witness` with its own volume and Ed25519 key, run as a separate container to model a separate administrative domain): `POST /add-checkpoint` with the new checkpoint, the previous size and a consistency proof; it verifies the log's signature against the configured public key, verifies **consistency with the last checkpoint it cosigned**, then stores and returns its **cosignature**; on an inconsistent checkpoint it refuses with `409`, keeps the evidence of the conflicting signed checkpoint and exposes it at `/conflicts` (this is the split-view detection, SEC-183).
- Publishing worker: drains unpublished checkpoints in order per publisher, records `audit_witness_receipts`, retries with backoff, never blocks audit writes (SEC-186); `AUDIT_WITNESS_LAG` alert when the newest checkpoint is unpublished for more than 30 minutes.
- RFC 3161: request a `timestamp` over the checkpoint's SHA-256 with `openssl ts -query`-compatible DER, store the token, verification described in SD-165; tests use a local stub TSA with a test certificate.
- SSRF-guarded HTTP client for all outbound calls (SD-117 guard), with the witness URL allowed explicitly.

📚 Source: backlog SD-164 (Epic 32) · provenance [STANDARD] [HARDENING] · priority P0

📏 Estimated size of issue: XL (6-8 person-days, BE, DevOps)

### ✅ Acceptance Criteria

- [ ] The witness refuses a checkpoint whose history is inconsistent with the one it cosigned, and records the conflict (SEC-183).
- [ ] A stubbed TSA token verifies offline against the test certificate (SEC-184).
- [ ] A witness outage does not delay a single audit write; the backlog drains in order after recovery; the lag alert fires after the threshold (SEC-186).
- [ ] `docker compose --profile witness up` runs the witness in a separate container and volume and the app cosigns successfully.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 32.2 (SD-163), Task 20.5 (SD-101)
SDISSUE_EOF
create_issue 6 '[Task 32.3] Off-host witness publishers and an independent witness service' 'Module 6: Detection and Response' 'backend,devops,security,monitoring,high-priority,epic:merkle-audit' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Anyone holding an export and a few public keys can check the log with no access to the application or its database.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `tools/audit-verifier/verify.mjs` (Node only, `node:crypto`, zero dependencies): inputs `--log audit.jsonl` (the existing JSON Lines export), `--checkpoints checkpoints.txt`, `--keys keys.json` (log and witness public keys), optional `--receipts` and `--tsr`; checks (1) every entry hash against the documented `sd-audit-v1` formula and the chain links, (2) Merkle root equals each checkpoint's root at its size, (3) checkpoint signatures, (4) consistency between consecutive checkpoints, (5) witness cosignatures, (6) RFC 3161 tokens via `openssl ts -verify` when present; machine-readable output and distinct exit codes (0 intact, 1 tampered, 2 inputs invalid, 3 verification incomplete).
- Endpoints: `GET /api/admin/audit-log/proof/{seq}` (inclusion proof against the newest covering checkpoint; `404 PROOF_NOT_AVAILABLE` while the builder has not reached it), `GET .../consistency?from=&to=`, plus the checkpoints list from SD-163; permission `audit-log:proof`; each call audited as a read.
- UI: audit-entry drawer gains "Download proof" (a JSON file the verifier accepts) and shows "Covered by checkpoint #n, witnessed by …"; the integrity panel shows the last checkpoint, last witness receipt and lag.
- The bundle verifier of SD-154 reuses the same module.

📚 Source: backlog SD-165 (Epic 32) · provenance [STANDARD] [PORTFOLIO] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE, FE)

### ✅ Acceptance Criteria

- [ ] The verifier succeeds on a freshly exported log without network or database access and returns the documented exit codes for tampered and invalid inputs (SEC-185).
- [ ] A downloaded inclusion proof verifies with the verifier for any covered entry.
- [ ] The Auditor can download proofs; other roles get `403` (SEC-163).
- [ ] The verifier works from a clean directory containing only the files and Node.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 32.1 (SD-162), Task 32.2 (SD-163), Task 32.3 (SD-164)
SDISSUE_EOF
create_issue 6 '[Task 32.4] Standalone verifier, proof API and UI' 'Module 6: Detection and Response' 'backend,frontend,security,monitoring,high-priority,epic:merkle-audit' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Show the attack that Module 3 documented as undetectable by the chain alone (SEC-86) and prove that checkpoints and the witness now catch it.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Extend `npm run audit:tamper-demo` with scenarios: (a) modify one entry; (b) delete the tail; (c) **rewrite an entry and recompute every later hash, anchor and Merkle node** (the attacker has full database and file access but not the signing key and not the witness); (d) replace the whole database with a forged history and a re-signed checkpoint using a different key; (e) conflicting checkpoint presented to the witness.
- Scheduled verification (`audit/scheduled-verification.ts`) additionally verifies the newest checkpoint's root against the recomputed tree and the latest witness receipt, and raises `AUDIT_TAMPER_DETECTED` (CRITICAL) with the finding type `CHECKPOINT_MISMATCH` or `WITNESS_MISMATCH`.
- Update `docs/audit-log.md`, `docs/threat-model.md` residual risk section (the host-administrator attack is now detected unless the attacker also compromises the signing key and the witness), and the README.
- Playwright: verify, tamper in the disposable fixture, verify again and see the checkpoint-based finding.

📚 Source: backlog SD-166 (Epic 32) · provenance [HARDENING] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE, QA, Docs)

### ✅ Acceptance Criteria

- [ ] Scenario (c) is caught by checkpoint and witness comparison while the chain-only verifier reports intact (SEC-182).
- [ ] Scenario (d) fails signature verification; scenario (e) is refused by the witness and recorded (SEC-182, SEC-183).
- [ ] The scheduled job raises one critical alert per finding without repeats.
- [ ] The documentation states what is still not covered (key and witness both compromised, or loss of every copy).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 32.4 (SD-165)
SDISSUE_EOF
create_issue 6 '[Task 32.5] Extended tamper demonstration and detection of full-chain rewrite' 'Module 6: Detection and Response' 'backend,testing,documentation,monitoring,high-priority,epic:merkle-audit' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Close the module with evidence a reviewer can follow in ten minutes.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-6.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Add SEC-154 to SEC-188 to `docs/testing.md` and `docs/asvs.json`; extend the threat model with section 8's table; update `docs/architecture.md`, `docs/permissions.md`, `docs/database-schema.md`, README.
- Full journey E2E: attack, enrichment, alert with ATT&CK chips, incident, playbook block, approval of an account action, evidence bundle verification, audit proof verification with the standalone tool.
- Write a case study `docs/case-study-audit-log.md`: from hash chain to witnessed Merkle log, with the tamper demo output and the verifier command (portfolio piece).
- Update the demo recording and the README feature list.

📚 Source: backlog SD-167 (Epic 32) · provenance [FOUNDATION] [PORTFOLIO] · priority P0

📏 Estimated size of issue: M (1-2 person-days, Docs, QA)

### ✅ Acceptance Criteria

- [ ] The E2E journey passes three consecutive runs on CI.
- [ ] SEC-154 to SEC-188 map to real test titles; the ASVS and traceability checks are green.
- [ ] The case study reproduces its own commands from a clean clone.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

all P0 tasks of Module 6
SDISSUE_EOF
create_issue 6 '[Task 32.6] Module 6 verification, documentation and portfolio write-up' 'Module 6: Detection and Response' 'documentation,testing,monitoring,high-priority,epic:merkle-audit' "$BODY"

# ---- Epic 33: Comments and Attachments ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Let people talk about a ticket, keep staff-only notes truly private, and record what happened on a ticket as a readable feed.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration for `ticket_comments`, `ticket_comment_revisions` and `ticket_activity` (section 3); permissions `comments:create`, `comments:create:internal`, `comments:read:internal` in `codes.ts`, `matrix.ts`, `docs/permissions.md`.
- Routes and strict schemas: body 1 to 4,000 characters, plain text, `visibility` default `PUBLIC`; an `INTERNAL` comment requires `comments:create:internal`; the object check is the same as for reading the ticket (unreadable equals missing, `404`), so a Guest or an uninvolved Employee cannot comment (SEC-189).
- Visibility filtering **in SQL** for the thread, the activity feed, unread counts and any count shown anywhere: a Guest never receives, counts or can infer internal notes (SEC-190).
- Edit: only the author, only within 15 minutes of creation (`COMMENT_EDIT_WINDOW_CLOSED` otherwise); each edit inserts a revision; revisions are readable by staff with `comments:read:internal` only (SEC-192); there is no delete route and no delete privilege.
- `ticket_activity` rows (status, assignment, priority, category, comment, attachment) are written **in the same transaction** as the change and the audit entry; rollback leaves none (SEC-193); internal activity rows are flagged and filtered like internal notes.
- Audit events `TICKET_COMMENT_ADDED` and `TICKET_COMMENT_EDITED` carry comment and ticket IDs and visibility, never text (SEC-166 pattern).
- Rate limit comment creation per user (default 20 per minute) via the shared limiter.

📚 Source: backlog SD-168 (Epic 33) · provenance [PRODUCT] [HARDENING] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] A Guest, an uninvolved Employee, the Administrator and the Auditor cannot read or write comments on a ticket they may not read: `404` or `403` as for tickets (SEC-189).
- [ ] No endpoint returns, counts or leaks internal notes to a Guest (SEC-190).
- [ ] Edits after 15 minutes are refused; every edit keeps a revision; other users cannot edit (SEC-192).
- [ ] If the audit write fails, the comment and its activity row roll back (SEC-193).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 21.4 (SD-107), Task 24.2 (SD-120)
SDISSUE_EOF
create_issue 7 '[Task 33.1] Comments, internal notes and the ticket activity feed (backend)' 'Module 7: Helpdesk and Data Protection' 'backend,database,security,high-priority,epic:comments-attachments' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

A readable conversation on the ticket page.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Ticket detail gains a thread (plain text, preserved line breaks via CSS `white-space: pre-wrap`, never HTML), a composer with an "Internal note" toggle visible only to roles with the permission, character counter, and an edit control inside the 15-minute window with a visible "edited" marker and revision viewer for staff.
- Activity feed interleaved with comments in time order; internal items visually distinct and absent for Guests (the API never sends them).
- Optimistic send with server reconciliation; errors keep the draft; keyboard accessible; empty and loading states.
- Component tests for each role view; extend the XSS E2E (SEC-26) to comments.

📚 Source: backlog SD-169 (Epic 33) · provenance [PRODUCT] · priority P1

📏 Estimated size of issue: M (1-2 person-days, FE)

### ✅ Acceptance Criteria

- [ ] Comment text with `<script>` and `<img onerror>` renders as text (SEC-191).
- [ ] A Guest's page never contains internal-note text, counts or empty placeholders for them (DOM assertion).
- [ ] A failed send preserves the draft.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 33.1 (SD-168)
SDISSUE_EOF
create_issue 7 '[Task 33.2] Comments and activity UI' 'Module 7: Helpdesk and Data Protection' 'frontend,medium-priority,epic:comments-attachments' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Define where files live and how they are named and limited, before any upload code exists.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration for `ticket_attachments`; permissions `attachments:upload`, `attachments:download` (section 4).
- `server/files/file-store.ts`: `interface FileStore { putStream; getStream; delete; exists }`; `LocalFileStore` writing under `ATTACHMENT_STORE_PATH` with keys `aa/bb/<uuid>` (random UUID v4 → no name or ticket in the path), directory mode `0700`, file mode `0600`, startup refuses a path under any served directory (reuse `security/private-file.ts`); optional `S3FileStore` (MinIO, compose profile `storage`) marked P2.
- Quotas: 5 attachments per ticket, 25 MB per ticket, 200 MB per user (configurable constants with security settings overrides later); exceeding returns `409 ATTACHMENT_QUOTA_EXCEEDED` (SEC-201).
- Name handling: `sanitizeFileName(name)` keeps a Unicode-normalised basename of at most 100 characters, strips path separators, control, bidi and zero-width characters (the same sanitiser family as `audit/sanitize.ts`), forces a safe extension taken from the **detected** type, never from the client; used for display and the `Content-Disposition` filename only.
- Retention link: attachments are removed with their ticket's retention rule (SD-191).

📚 Source: backlog SD-170 (Epic 33) · provenance [HARDENING] [STANDARD] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] The store refuses a path inside a served directory and creates directories with mode `0700` (SEC-197).
- [ ] The stored path contains neither the original name nor the ticket id (SEC-197).
- [ ] Quotas are enforced per ticket and per user (SEC-201).
- [ ] Hostile names (`../../etc/passwd`, NUL bytes, bidi override, 300 characters, `CON.txt`) are neutralised (SEC-197).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 33.1 (SD-168)
SDISSUE_EOF
create_issue 7 '[Task 33.3] Attachment model, file store abstraction and quotas' 'Module 7: Helpdesk and Data Protection' 'backend,database,high-priority,epic:comments-attachments' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Accept only what the application means to accept, and stop everything else as early as possible.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `POST /api/tickets/{id}/attachments` as `multipart/form-data` handled with a streaming parser (`busboy`), one file per request, field and part limits, `Content-Length` checked before reading and the byte count enforced while streaming (`ATTACHMENT_MAX_BYTES`, default 10 MB); on overrun abort, delete the partial file and return `413` (SEC-196).
- Object authorization first (readable ticket, `attachments:upload`), then rate limit (10 uploads per minute per user).
- Type decision by **content**, never by `Content-Type` or extension: sniff the first bytes with `file-type` and accept an allowlist (PNG, JPEG, GIF, WebP, PDF, plain text without NUL bytes and valid UTF-8); everything else, including SVG, HTML, XML, JavaScript, archives, executables, Office macro formats and polyglots whose declared and detected types differ, returns `422 ATTACHMENT_REJECTED` with a reason enum (SEC-194, SEC-195).
- Stream to `ATTACHMENT_QUARANTINE_PATH`, compute SHA-256 and size on the fly, insert the row as `PENDING` in the same transaction as the activity and audit entries (`ATTACHMENT_UPLOADED`: ids, size, detected type, hash; no name).
- Duplicates (same ticket, same hash) are rejected idempotently.
- CSRF applies (session auth); the endpoint is not available to API keys in v1.

📚 Source: backlog SD-171 (Epic 33) · provenance [HARDENING] [STANDARD] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] An executable renamed `.png` with `image/png` is refused; a genuine PNG with a `.exe` name is accepted and stored as `.png` (SEC-194).
- [ ] SVG, HTML, JavaScript, ZIP, ELF and PE files are refused (SEC-195).
- [ ] A 100 MB stream is aborted after the limit, no partial file remains, response `413`, and memory stays flat (SEC-196).
- [ ] A rapid burst beyond the rate limit is throttled (SEC-201).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 33.3 (SD-170), Task 22.2 (SD-111)
SDISSUE_EOF
create_issue 7 '[Task 33.4] Upload endpoint: streaming validation by content' 'Module 7: Helpdesk and Data Protection' 'backend,security,high-priority,epic:comments-attachments' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

No file becomes downloadable until it has been scanned and found clean.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Compose profile `av` with `clamav/clamav` and a health check; `server/files/clamav.ts` speaking the clamd `INSTREAM` protocol over TCP with chunking, size and timeout limits (no shell-out, no `clamscan` binary), `PING` for health.
- Scanner worker: picks `PENDING` rows, streams the quarantined file to clamd, then: `CLEAN` moves the file to the final store (and encrypts it at rest once SD-192 exists) and sets `scanned_at`; `INFECTED` deletes the file, keeps metadata and hash, raises security event `MALWARE_UPLOADED` (HIGH, with ATT&CK technique mapping T1105 Ingress Tool Transfer for context if the pinned dataset contains it) and audit `ATTACHMENT_QUARANTINED`, notifies the uploader generically; scanner errors set `SCAN_ERROR` after five attempts with backoff.
- **Fail closed:** with `ATTACHMENT_SCAN_REQUIRED=true` a scanner outage leaves files `PENDING` and not downloadable; nothing is ever promoted without a clean verdict (SEC-199). Setting it to `false` is refused in production.
- The EICAR test string is assembled **at runtime** in tests (never committed as a file, to avoid false positives on developer machines and CI scanners).
- Health endpoint reports scanner reachability and signature age; metrics for queue depth, scan time, infected count.

📚 Source: backlog SD-172 (Epic 33) · provenance [HARDENING] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE, DevOps)

### ✅ Acceptance Criteria

- [ ] An EICAR upload ends `INFECTED`, the file is gone, a security event and an audit entry exist, and download answers `404` (SEC-198).
- [ ] With ClamAV stopped, uploads remain `PENDING` and cannot be downloaded; after restart they are scanned in order (SEC-199).
- [ ] A clean file moves from quarantine to the store exactly once, even if two workers race (row lock or `FOR UPDATE SKIP LOCKED`).
- [ ] `ATTACHMENT_SCAN_REQUIRED=false` is refused in production.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 33.4 (SD-171), Task 20.5 (SD-101)
SDISSUE_EOF
create_issue 7 '[Task 33.5] Malware scanning with ClamAV and the quarantine state machine' 'Module 7: Helpdesk and Data Protection' 'backend,devops,security,high-priority,epic:comments-attachments' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Deliver files so that a stored file can never become an attack on a user's browser, and show their state clearly.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `GET /api/tickets/{id}/attachments/{attId}`: object authorization (unreadable ticket equals missing), status must be `CLEAN` (`409 ATTACHMENT_NOT_READY` when `PENDING`, `404` for `INFECTED`), then stream with `Content-Type` from the **detected** type, `Content-Disposition: attachment; filename*=UTF-8''…` (sanitised), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'`, `Cache-Control: private, no-store`, `Cross-Origin-Resource-Policy: same-origin`; no `Range` support; PDFs are never served inline.
- `DELETE`: the uploader within 15 minutes, or a Manager at any time; removes the file and its row (the metadata deletion is audited with the hash).
- Angular: upload control with drag and drop, progress, per-file status badge (`Scanning`, `Ready`, `Blocked`), accessible announcements, error messages from reason enums, download through a plain link (the browser handles `attachment`).
- Antivirus and type rules documented in `docs/attachments.md`, including the allowlist and why SVG is excluded.

📚 Source: backlog SD-173 (Epic 33) · provenance [HARDENING] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE, FE)

### ✅ Acceptance Criteria

- [ ] Every download response carries the full header set above; a stored HTML-in-PNG polyglot is served only as a download with the detected type (SEC-200).
- [ ] A user without ticket access gets `404` or `403` exactly as for the ticket itself (SEC-200).
- [ ] `PENDING` and `INFECTED` files cannot be downloaded (SEC-198, SEC-199).
- [ ] The UI shows the scan state and never renders file content inline.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 33.5 (SD-172)
SDISSUE_EOF
create_issue 7 '[Task 33.6] Safe download and attachment UI' 'Module 7: Helpdesk and Data Protection' 'backend,frontend,security,high-priority,epic:comments-attachments' "$BODY"

# ---- Epic 34: SLA, Priorities and Categories ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Classify tickets so they can be prioritised, filtered and measured.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration: `tickets.priority`, `tickets.category_id`, `categories`, and status `WAITING` (waiting for the requester), with CHECK constraints updated and existing rows backfilled to `NORMAL` and a default category `General`; update `TICKET_STATUSES`, the policy (who may set `WAITING`), `docs/permissions.md`.
- Strict schemas: creation accepts `categoryId` (active categories only) and **never** `priority`; creators always start at `NORMAL`; only `tickets:priority:set` (Manager) may change priority; category change by the Manager; mass-assignment attempts are rejected (SEC-202).
- Admin categories CRUD (`categories:manage`), soft-deactivation (never delete a used category); audit entries with ids.
- List filters by priority and category; ticket list and detail show them; activity and audit entries for changes (`TICKET_PRIORITY_CHANGED`, `TICKET_CATEGORY_CHANGED`, ids and enums only).

📚 Source: backlog SD-174 (Epic 34) · provenance [PRODUCT] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE, FE, DB)

### ✅ Acceptance Criteria

- [ ] A Guest or Employee sending `priority` on create or update is refused with the strict-schema error (SEC-202).
- [ ] An inactive or unknown category is refused; a used category cannot be deleted, only deactivated.
- [ ] Migration keeps all existing tickets readable under the same rules (existing tests unchanged).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 33.1 (SD-168)
SDISSUE_EOF
create_issue 7 '[Task 34.1] Priority, category and the `WAITING` status' 'Module 7: Helpdesk and Data Protection' 'backend,frontend,database,high-priority,epic:sla' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Compute due times in working time, across weekends, holidays and daylight-saving changes, correctly.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration for `sla_policies`, `business_calendars`, `ticket_sla`; permission `sla:manage` (Administrator).
- Pure library `server/sla/business-time.ts` with `addBusinessMinutes(start, minutes, calendar)` and `businessMinutesBetween(a, b, calendar)`, using Luxon (or Temporal when stable in the Node version) for zones; **no hand-written DST arithmetic**. Calendar: IANA timezone, weekly intervals, holiday dates; validation rejects overlapping or reversed intervals.
- Default policies (documented, editable): Urgent 30 minutes first response and 4 hours resolution on a 24x7 calendar; High 2 and 8 business hours; Normal 4 and 24; Low 8 and 72.
- Computation on ticket creation and when priority changes; status `WAITING` pauses the resolution clock (SEC-205); `first_response_at` is set by the first public comment of a staff member or the first status change away from `OPEN`.
- Exhaustive tests with the fake clock: weekend crossing, holidays, start outside hours, Europe/Warsaw spring-forward and fall-back days, zero and very large durations.

📚 Source: backlog SD-175 (Epic 34) · provenance [PRODUCT] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] The due time of a ticket created Friday 15:30 with 4 business hours lands Monday after the weekend as documented (SEC-203).
- [ ] Calculations across both DST transitions of `Europe/Warsaw` match the fixture table (SEC-203).
- [ ] `WAITING` pauses the clock and resuming extends the due time by the paused duration (SEC-205).
- [ ] Invalid calendars are refused at save.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 34.1 (SD-174)
SDISSUE_EOF
create_issue 7 '[Task 34.2] SLA policies and business-hours calculation' 'Module 7: Helpdesk and Data Protection' 'backend,database,high-priority,epic:sla' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Notice when a ticket is about to miss, and when it has missed, exactly once each.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Scheduled worker (same pattern as `audit/scheduled-verification.ts`, interval 1 minute, leader selection through a Postgres advisory lock so multiple instances do not duplicate work): selects tickets with an unresolved clock whose elapsed share crosses 80% (`SLA_AT_RISK`) or 100% (`SLA_BREACHED`) for either target.
- Idempotent: sets `at_risk_notified_at` and `breached_notified_at` with a conditional update so each event is emitted once per ticket and target (SEC-204).
- Emits domain events (`ticket.sla_at_risk`, `ticket.sla_breached`) through the outbox (SD-180) and writes an audit entry `TICKET_SLA_BREACHED` (ids only) for breaches.
- Resolved tickets stop their clocks; `RESOLVED` after breach records the breach permanently for reports.
- Metrics: tickets at risk, breached, compliance ratio; worker lag.

📚 Source: backlog SD-176 (Epic 34) · provenance [PRODUCT] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] On the fake clock a ticket emits `at_risk` at 80% and `breached` at 100%, once each, even with the worker restarted or two workers running (SEC-204).
- [ ] A resolved ticket emits nothing further.
- [ ] A paused (`WAITING`) ticket does not breach during the pause (SEC-205).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 34.2 (SD-175), Task 35.2 (SD-180)
SDISSUE_EOF
create_issue 7 '[Task 34.3] SLA timers, at-risk and breach detection' 'Module 7: Helpdesk and Data Protection' 'backend,high-priority,epic:sla' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

React to SLA events with a small, safe, configurable set of actions.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Setting `sla_escalation_rules` (strict schema, `sla:manage`): per level (`AT_RISK`, `BREACHED`) a list of actions from a closed set: `NOTIFY_MANAGERS`, `NOTIFY_ASSIGNEE`, `BUMP_PRIORITY` (one level, never above `URGENT`).
- Execution consumes the SLA events from the outbox idempotently by event id; `BUMP_PRIORITY` is a state change with its own audit and activity entries (actor `SYSTEM`) and recomputes SLA targets; each rule fires at most once per ticket and level (SEC-206).
- Notifications use SD-179; recipients are active users who may read the ticket (never blocked or deleted users, never the Administrator or Auditor).
- No reassignment action exists on purpose (documented in `docs/sla.md`): moving work between people stays a human decision.

📚 Source: backlog SD-177 (Epic 34) · provenance [PRODUCT] · priority P1

📏 Estimated size of issue: M (1-2 person-days, BE)

### ✅ Acceptance Criteria

- [ ] A breach notifies managers once and bumps the priority one level once, with `SYSTEM` audit and activity entries (SEC-206).
- [ ] Blocked or deleted users never receive escalations (SEC-206).
- [ ] An unknown action in the setting is refused at save.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 34.3 (SD-176)
SDISSUE_EOF
create_issue 7 '[Task 34.4] Escalation rules' 'Module 7: Helpdesk and Data Protection' 'backend,security,medium-priority,epic:sla' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Make deadlines visible and configurable.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Ticket list and detail: priority and category selectors (by permission), SLA countdown badges (`On track`, `At risk`, `Breached`, `Paused`) computed from server-provided due times and server time offset, never from the client clock alone.
- Admin pages `/admin/categories`, `/admin/sla` (policies, calendars with a weekly grid editor, holidays, escalation rules) with validation mirroring the server and a preview of "due time for a ticket created now".
- Accessibility: badges have text, not colour alone; component tests for each state.

📚 Source: backlog SD-178 (Epic 34) · provenance [PRODUCT] [PORTFOLIO] · priority P1

📏 Estimated size of issue: M (1-2 person-days, FE)

### ✅ Acceptance Criteria

- [ ] The badge states render for each fixture and match server values.
- [ ] The preview uses the same library output as the server (shared fixtures).
- [ ] Only users with the permissions see the admin pages; the backend refuses others.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 34.2 (SD-175), Task 34.3 (SD-176), Task 34.4 (SD-177)
SDISSUE_EOF
create_issue 7 '[Task 34.5] SLA UI and administration pages' 'Module 7: Helpdesk and Data Protection' 'frontend,medium-priority,epic:sla' "$BODY"

# ---- Epic 35: Real-time and Notifications ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

An in-app inbox of what needs a person's attention.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration for `notifications` and `notification_preferences`; permission `notifications:read-own`.
- Types: `TICKET_ASSIGNED`, `TICKET_STATUS_CHANGED`, `COMMENT_ADDED` (public or internal as the recipient may see), `SLA_AT_RISK`, `SLA_BREACHED`, `ATTACHMENT_BLOCKED`, `SECURITY_*` for administrators and auditors (incident, approval pending).
- API: list (cursor pagination), unread count, mark read, mark all read, preferences (per type: in-app, email); a user sees only their own rows (another user's id returns `404`).
- Payload is ids and type only; the UI resolves titles through the normal ticket API, so a revoked access shows nothing (a notification for a ticket the user can no longer read renders as "no longer available").
- Retention classes registered for SD-191 (read 90 days, unread 180).

📚 Source: backlog SD-179 (Epic 35) · provenance [PRODUCT] · priority P0

📏 Estimated size of issue: M (1-2 person-days, BE, FE)

### ✅ Acceptance Criteria

- [ ] A user can read and change only their own notifications and preferences (SEC-208).
- [ ] A notification whose ticket became unreadable reveals nothing about it.
- [ ] Rows contain no ticket text (schema and payload test).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 33.1 (SD-168)
SDISSUE_EOF
create_issue 7 '[Task 35.1] Notification model, centre and preferences' 'Module 7: Helpdesk and Data Protection' 'backend,frontend,high-priority,epic:realtime' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Make events reliable and make recipient selection impossible to get wrong.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `domain_event_outbox` written in the same transaction as every ticket, comment, attachment, SLA and incident change; envelope `{ id (uuid v7), type, aggregateId, occurredAt, payload (ids only) }`.
- Relay worker (advisory-lock leader): publishes unpublished rows in id order to the Redis event bus, marks `published_at`, retries; with Redis down, events accumulate and are delivered after recovery, none lost (SEC-213); published rows purged after 48 hours.
- `recipientsFor(event)` in `server/events/recipients.ts`: uses `visibleTicketsFor` / `canReadTicket` and the comment visibility rule to compute the **exact** set of users entitled to know; internal-note events exclude Guests; incident and approval events go to administrators and auditors only.
- **Defence in depth:** each consumer (notifications, SSE, email, webhooks) re-checks `canReadTicket(user, ticket)` immediately before delivery; the double check is tested by revoking access between fan-out and delivery.
- Consumers are idempotent by event id (unique `(consumer, event_id)` ledger); the webhook subscriber of SD-117 moves from the in-process emitter to this outbox.
- Unit test matrix of `recipientsFor` across roles and ticket relationships.

📚 Source: backlog SD-180 (Epic 35) · provenance [DESIGN] [HARDENING] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] A redelivered event creates no duplicate notification, mail or webhook (SEC-213).
- [ ] With Redis down during a burst of changes, all events are delivered in order after recovery (SEC-213).
- [ ] Revoking a user's access between fan-out and delivery results in no delivery (SEC-208).
- [ ] `recipientsFor` never includes the Administrator or Auditor for ticket events, nor Guests for internal notes (SEC-190, SEC-208).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 35.1 (SD-179), Task 22.4 (SD-113)
SDISSUE_EOF
create_issue 7 '[Task 35.2] Domain events: transactional outbox and authorized fan-out' 'Module 7: Helpdesk and Data Protection' 'backend,database,security,high-priority,epic:realtime' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Push events to open browsers without creating a side channel around authorization or session expiry.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `GET /api/stream` (Node runtime, `dynamic = 'force-dynamic'`, `ReadableStream`, `text/event-stream`, `Cache-Control: no-store`, `X-Accel-Buffering: no`); requires a full session (anonymous `401`, restricted stages `403`, SEC-207); Caddy `flush_interval -1` documented and added to the reference config.
- Per-connection subscription to the user's channel only; the event body contains `type`, `ticketId`, `eventId` and nothing else; the client fetches details through the normal authorized API.
- Session lifecycle: re-validate the session every 30 seconds (idle and absolute expiry honoured), and subscribe to a Redis `session.revoked` topic published by revocation code paths so block, delete, reset, logout and administrator revoke **close the stream within seconds** (SEC-209).
- Heartbeat comment every 20 seconds; `Last-Event-ID` resume replays missed events from the outbox, **re-filtered through the authorization check at replay time**, in order, once (SEC-210); replay window 48 hours.
- Limits: `SSE_MAX_CONNECTIONS_PER_USER` (default 5, `429 STREAM_LIMIT_REACHED`), a global cap, 6 hours maximum connection age; slow consumer protection (drop the connection when the write buffer exceeds a limit).
- Metrics: open streams, events sent, disconnect reasons; no per-user labels.

📚 Source: backlog SD-181 (Epic 35) · provenance [STANDARD] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] Anonymous and restricted-stage requests are refused; a full session connects (SEC-207).
- [ ] Blocking the user, resetting the password or revoking the session closes the open stream within five seconds (SEC-209).
- [ ] After a reconnect with `Last-Event-ID`, missed authorized events arrive once and in order; events for tickets whose access was removed meanwhile do not (SEC-210).
- [ ] The sixth concurrent connection of one user is refused (SEC-211).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 35.2 (SD-180)
SDISSUE_EOF
create_issue 7 '[Task 35.3] Server-sent events endpoint' 'Module 7: Helpdesk and Data Protection' 'backend,security,high-priority,epic:realtime' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Reach people who are not in the app, without making mail an information leak.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Consumer turning selected notification types into mail through the outbox of SD-135 for users who enabled the `email` channel (opt-in, default off except critical security notices of SD-138); requires a verified email (SD-136).
- Content: ticket number, event type, time, and a link to the ticket; **no title, description, comment text or attachment names** (D7-07). Footer with the preferences link.
- Immediate or daily digest per user preference; digest built in one query respecting `canReadTicket` at send time.
- One-click unsubscribe per type through a signed, single-purpose token link (no login needed, scoped to unsubscribing only, expires in 30 days); `List-Unsubscribe` header.
- Rate limit per user (maximum 30 mails per hour), and a global cap; SMTP outage never affects the originating request (SEC-212).

📚 Source: backlog SD-182 (Epic 35) · provenance [PRODUCT] [HARDENING] · priority P1

📏 Estimated size of issue: M (1-2 person-days, BE)

### ✅ Acceptance Criteria

- [ ] A mail contains the link and event type and none of the ticket's text (SEC-212).
- [ ] The unsubscribe token only unsubscribes, expires, and cannot be used for anything else (SEC-212).
- [ ] Users without a verified email receive nothing by mail.
- [ ] Mail failure does not affect the request and retries on the documented schedule (SEC-212).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 35.2 (SD-180), Task 27.1 (SD-135)
SDISSUE_EOF
create_issue 7 '[Task 35.4] Email notifications' 'Module 7: Helpdesk and Data Protection' 'backend,medium-priority,epic:realtime' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Make the UI live and prove no user sees another user's events.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `RealtimeService` wrapping `EventSource` with exponential backoff, `Last-Event-ID` handled by the browser, pause when the tab is hidden (reconnect on focus), cleanup on logout and on `401`.
- Live updates: ticket list and ticket detail refresh the affected row through the normal API on `eventId`; toasts for assigned and breached; unread badge in the shell; accessible `aria-live` announcements.
- Cross-user E2E leak test with three browser contexts (Guest creator, Employee assignee, uninvolved Employee) and an Administrator context: events for the ticket reach exactly the first two; internal notes never reach the Guest; the Administrator receives no ticket events (SEC-208).
- Behaviour on session revocation: stream closes, the app signs the user out cleanly.

📚 Source: backlog SD-183 (Epic 35) · provenance [PRODUCT] · priority P0

📏 Estimated size of issue: M (1-2 person-days, FE, QA)

### ✅ Acceptance Criteria

- [ ] The leak test passes: no event reaches an unauthorized context (SEC-208).
- [ ] A reconnect after a network drop shows missed changes without a manual reload (SEC-210).
- [ ] Logout and revocation close the stream and clear listeners (no leak in the test).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 35.3 (SD-181), Task 35.1 (SD-179)
SDISSUE_EOF
create_issue 7 '[Task 35.5] Angular real-time integration and the leak test' 'Module 7: Helpdesk and Data Protection' 'frontend,testing,security,high-priority,epic:realtime' "$BODY"

# ---- Epic 36: Search and Reports ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Fast, relevant search that cannot reveal a ticket, a comment or even a count the caller may not see.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration: extension `unaccent`; generated `search_vector` on `tickets` (title weight A, description weight B) and on `ticket_comments` using the `simple` configuration with `unaccent` (mixed Polish and English content, D7-08); GIN indexes.
- `GET /api/tickets/search?q=&limit=&cursor=`: query through `websearch_to_tsquery('simple', unaccent($1))` with the value bound as a parameter, length capped at 200, empty or operator-only queries return `400 SEARCH_QUERY_INVALID`; the result set is `visibleTicketsFor(user)` **intersected in SQL** with matches; comment matches count only for comments the caller may read (`INTERNAL` excluded for Guests) (SEC-214, SEC-215).
- Ranking with `ts_rank_cd`; snippets with `ts_headline` configured with private-use Unicode markers (`U+E000`, `U+E001`) as start and stop selectors; the API returns plain text with markers, and the frontend splits on them and renders `<mark>` elements by Angular templates — **no `innerHTML` anywhere** (SEC-216).
- Total counts only for the visible set; pagination by keyset; statement timeout and `LIMIT` cap protect the database.
- Administrator, Auditor and anonymous callers never reach the endpoint (`403`, `401`).

📚 Source: backlog SD-184 (Epic 36) · provenance [PRODUCT] [HARDENING] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] Across Guest, Employee (involved and uninvolved), Manager, Administrator and Auditor fixtures the same query returns exactly the visible subset, and counts equal the visible subset (SEC-214).
- [ ] A term that appears only in an internal note neither returns the ticket for a Guest nor changes any Guest-visible count or ranking (SEC-215).
- [ ] Hostile queries (`'; DROP TABLE tickets;--`, 10,000 characters, quotes, `&`, `|`, `!`, `<->`) are handled safely; highlight markers cannot produce markup (SEC-216).
- [ ] Search of an `unaccent` query matches accented text (`zażółć` matches `zazolc`).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 33.1 (SD-168), Task 34.1 (SD-174)
SDISSUE_EOF
create_issue 7 '[Task 36.1] Full-text search with row-level authorization' 'Module 7: Helpdesk and Data Protection' 'backend,database,security,high-priority,epic:search-reports' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Let people build and keep the views they use daily.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Filter model (strict schema): status set, priority set, category set, assignee (`me`, `unassigned`, user id the caller may see), created and updated ranges, SLA state (`ON_TRACK`, `AT_RISK`, `BREACHED`, `PAUSED`), text; all combined with the visibility predicate in SQL.
- `saved_filters` CRUD (owner only; other users' ids return `404`; maximum 20 per user; name sanitised; definition validated on save and on load because the schema evolves) (SEC-217).
- URL-serialisable filter state in the Angular list (shareable links that still obey each viewer's authorization), a saved-views dropdown, keyboard-friendly filter bar.
- Index review for the common filter combinations (explain plans recorded in the PR).

📚 Source: backlog SD-185 (Epic 36) · provenance [PRODUCT] · priority P1

📏 Estimated size of issue: M (1-2 person-days, BE, FE)

### ✅ Acceptance Criteria

- [ ] A saved filter can be read, changed and deleted only by its owner (SEC-217).
- [ ] Opening someone else's shared filter link shows only what the viewer may see.
- [ ] An outdated saved definition is migrated or rejected with a clear message, never executed unvalidated.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 36.1 (SD-184), Task 34.3 (SD-176)
SDISSUE_EOF
create_issue 7 '[Task 36.2] Advanced filters and saved views' 'Module 7: Helpdesk and Data Protection' 'backend,frontend,medium-priority,epic:search-reports' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Operational insight for managers, computed in SQL and scoped by role.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `GET /api/reports/summary?from=&to=`: tickets opened and resolved per day, by status, priority and category, backlog age buckets, median and 90th-percentile time to first response and to resolution (business time from SD-175), SLA compliance percentage per priority, workload per assignee. Permission `reports:read` (Manager); an Employee receives only their own workload and SLA figures from a separate endpoint; Guest, Administrator and Auditor get `403` (SEC-218).
- Aggregation queries use materialised daily rollups refreshed by a scheduled worker for ranges over 31 days; small ranges query live; all queries have statement timeouts and a maximum range of 366 days.
- Angular dashboard `/reports` with small SVG chart components (no heavy charting dependency, D7-09): bars, lines, stacked bars, a compliance gauge; text alternatives and a data-table toggle for accessibility.
- Rounding and timezone rules documented (reports use the SLA calendar timezone).

📚 Source: backlog SD-186 (Epic 36) · provenance [PRODUCT] [PORTFOLIO] · priority P1

📏 Estimated size of issue: L (3-5 person-days, BE, FE)

### ✅ Acceptance Criteria

- [ ] Fixture data yields exactly the expected medians, percentiles and compliance values (hand-computed table) (SEC-218).
- [ ] Employees see only their own figures; other roles are refused (SEC-218).
- [ ] The dashboard renders with keyboard-accessible data tables for each chart.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 34.3 (SD-176), Task 36.1 (SD-184)
SDISSUE_EOF
create_issue 7 '[Task 36.3] Metrics dashboard' 'Module 7: Helpdesk and Data Protection' 'backend,frontend,medium-priority,epic:search-reports' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Produce shareable outputs safely.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `GET /api/reports/export?format=csv|pdf` (permission `reports:export`, step-up required): CSV of aggregate tables only (no ticket text) with formula neutralisation reused from the audit export (prefix for cells starting `=`, `+`, `-`, `@`, tab, CR); PDF with `pdfkit` embedding the self-hosted font (Polish diacritics), text drawn as text (no HTML conversion), charts drawn from the same data.
- Size and row caps; the export is **audited before** data is sent (`REPORT_EXPORTED`: ids, format, range, row count) (SEC-219).
- Optional scheduled weekly report mailed to opted-in managers through the mail service (aggregate data only, PDF attached under a size cap).
- Document the PDF generator's attack surface (no external resources, no user HTML) in `docs/reports.md`.

📚 Source: backlog SD-187 (Epic 36) · provenance [PRODUCT] [HARDENING] · priority P1

📏 Estimated size of issue: M (1-2 person-days, BE)

### ✅ Acceptance Criteria

- [ ] A category named `=HYPERLINK("http://evil")` appears neutralised in the CSV and as inert text in the PDF (SEC-219).
- [ ] The export entry exists before the response body is sent; exceeding the cap is refused (SEC-219).
- [ ] The weekly mail contains aggregates only.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 36.3 (SD-186)
SDISSUE_EOF
create_issue 7 '[Task 36.4] Reports and exports (CSV and PDF)' 'Module 7: Helpdesk and Data Protection' 'backend,medium-priority,epic:search-reports' "$BODY"

# ---- Epic 37: GDPR and Data Protection Toolkit ----
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Know exactly which personal data the system holds and why, and make sure it stays known.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `docs/privacy/data-inventory.json`: every table and column with `category` (`IDENTIFIER`, `CONTACT`, `CREDENTIAL`, `CONTENT`, `TECHNICAL`, `NONE`), `purpose`, `lawfulBasis`, `retentionClass`, `encryption` (`none`, `field`, `at-rest`), and whether the column is **exported** and **erased** on a subject request.
- `docs/privacy/records-of-processing.md` (Article 30 style): purposes, categories of data subjects and data, recipients (the optional external services: Turnstile, AbuseIPDB, Canarytokens, Loki, SMTP), international transfers, retention, security measures.
- Test `schema-inventory.test.ts`: reads the Drizzle schema and fails when any column is missing from the inventory or when an inventory entry no longer exists; ties into `npm test`.
- `docs/privacy/dpia.md`: a data protection impact assessment of the audit log, the risk engine (SD-143) and the incident evidence (SD-154), with identified risks and mitigations.

📚 Source: backlog SD-188 (Epic 37) · provenance [STANDARD] · priority P0

📏 Estimated size of issue: M (1-2 person-days, Docs, QA)

### ✅ Acceptance Criteria

- [ ] Adding a column without an inventory entry fails the test suite (SEC-220).
- [ ] Every credential-category column is marked as excluded from exports (SEC-221).
- [ ] The records of processing list every optional external service and its default state.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 33.1 (SD-168)
SDISSUE_EOF
create_issue 7 '[Task 37.1] Personal data inventory and records of processing' 'Module 7: Helpdesk and Data Protection' 'documentation,testing,security,high-priority,epic:privacy' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Give a person their data, and only theirs, safely.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `GET /api/me/privacy/export` (permission `privacy:export-own`, step-up required, one export per hour per user): JSON bundle of the profile (login, names, email, role, timestamps), authored tickets and comments, attachment **metadata** (and the files themselves as an optional second download), notification and preference rows, session and trusted-device summaries, passkey **names and creation dates** (no credential material), linked identities, API key metadata (no secrets), and the audit entries in which the user is the actor or the subject (personal fields decrypted when the key still exists).
- Administrator-initiated export (`POST /api/admin/privacy/exports`, `privacy:export-any`, step-up, reason code required, audited with the subject reference): same builder, delivered as a download to the administrator, who is told to pass it on out of band.
- Excluded by construction (driven by the inventory flags of SD-188): password hashes, TOTP secrets, recovery code hashes, token digests, API key digests, webhook secrets, other people's content, internal notes **about** the subject that contain other staff's personal data (listed by count only).
- The export is audited before data is sent (`PRIVACY_EXPORT_CREATED`: subject reference, size, section list); ZIP size cap; generated in memory or a private temp file removed immediately after sending.

📚 Source: backlog SD-189 (Epic 37) · provenance [STANDARD] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] The bundle contains only the subject's own data and none of the excluded categories (scanner test over the JSON for secret-shaped keys and for another user's identifiers) (SEC-221).
- [ ] A user cannot export another user's data; the administrator path is audited with a reason (SEC-221).
- [ ] Repeated exports are rate-limited; the export entry exists before the body is sent.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 37.1 (SD-188)
SDISSUE_EOF
create_issue 7 '[Task 37.2] Subject access export' 'Module 7: Helpdesk and Data Protection' 'backend,security,high-priority,epic:privacy' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Honour a deletion request without breaking the property that makes the audit log valuable: the hash chain (and Merkle tree) must still verify. The mechanism is to store personal fields as ciphertext under a per-subject key, so that destroying the key erases the data while the chain commits to the ciphertext.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- **Audit format `sd-audit-v2`:** migration adds `audit_log.format_version` (default 1). For version 2, the personal fields `actor_login`, `subject_login` and `ip` are stored as envelope strings `v2:<keyId>:<nonce>:<ciphertext>:<tag>` (AES-256-GCM, additional authenticated data = `seq` and column name) under the subject's key; the canonical text hashed for `entry_hash` is built from the **stored** strings, so the hash is independent of key availability. The verifier (`audit/verify.ts`, the standalone verifier of SD-165, the Merkle builder) dispatches by `format_version`; chains mixing v1 and v2 entries verify (SEC-223).
- **Subject keys:** `subject_keys` with a random 256-bit key per user created lazily, wrapped by the active key-encryption key (SD-192); entries without an authenticated user (failed login for an unknown account, anonymous refusals) use a **daily key** (`DAY`, `YYYYMMDD`) so that the personal data of unauthenticated traffic can be erased in bulk by retention (SD-191).
- **Reading:** the audit browser, export and detail drawer decrypt when the key exists and show `[erased]` for the field when it was destroyed; exports mark erased fields explicitly; filters by login resolve through `actor_user_id` (not by decrypting).
- **Erasure transaction** (`privacy:erase`, step-up, optional four-eyes by setting `privacy_erasure_four_eyes`): (1) pseudonymise the `users` row (`login` to `deleted-<8 hex>`, names to `Deleted user`, email cleared, password replaced by a random hash, TOTP secret, recovery codes, passkeys, external identities, API keys, webhook subscriptions, notifications, trusted devices and login contexts removed, sessions revoked); (2) tickets keep their records (business record, creator shown as "Deleted user"); with `redact_content = true` the user's own tickets' text, comments and attachments are replaced by a removal notice and files deleted; (3) assigned open tickets are unassigned (status unchanged) and managers are notified; (4) **destroy the subject key** (overwrite `wrapped_key`, set `destroyed_at`); (5) write `PRIVACY_ERASURE_COMPLETED` (keyed subject reference, counts, flags; no personal data).
- Blocked cases: the protected `ADMIN`, and the only active Administrator (`ERASURE_BLOCKED`), the requester erasing themselves without a second approver when four-eyes is on.
- **Legacy v1 entries** cannot be rewritten without breaking the chain. Document the limitation and the options (O7-01): the legitimate-interest basis for security logs, a cut-over after which new entries are v2 only, and an optional archive-and-restart procedure.
- Update `docs/audit-log.md` (format v2, canonical text, erasure semantics), threat model and DPIA.

📚 Source: backlog SD-190 (Epic 37) · provenance [STANDARD] [HARDENING] · priority P0

📏 Estimated size of issue: XL (6-8 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] After an erasure and key destruction, `npm run audit:verify` and the scheduled job still report `INTACT`, the Merkle proofs still verify, and the previous checkpoint remains consistent (SEC-222, SEC-223).
- [ ] The erased user's login and IP appear as `[erased]` in the browser and the export; nothing in the database, logs or backups of the application reveals them after the key is destroyed (SEC-222, SEC-223).
- [ ] A chain with v1 and v2 entries verifies with the live verifier and the standalone verifier (SEC-223).
- [ ] `ADMIN`, the last active Administrator and a self-approval under four-eyes are refused (SEC-227).
- [ ] Open assigned tickets are unassigned and managers notified; the ticket remains readable under the usual rules (SEC-227).
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 37.1 (SD-188), Task 37.5 (SD-192), Task 21.4 (SD-107)
SDISSUE_EOF
create_issue 7 '[Task 37.3] Erasure through pseudonymisation and crypto-shredding of the audit log' 'Module 7: Helpdesk and Data Protection' 'backend,database,security,high-priority,epic:privacy' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Replace the hard-coded purge with documented, configurable, auditable retention.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Migration for `retention_policies`; permissions `retention:read` (Administrator, Auditor) and `retention:manage` (Administrator); registry in `server/maintenance/retention.ts` with one handler per class and its default: security events 90 days (keeps the current behaviour), login attempts 30 days, sessions (expired or revoked) 30 days, password resets 7 days after expiry, email outbox 7 days, notifications read 90 and unread 180 days, webhook deliveries 30 days, playbook runs 365 days, login contexts 180 days, incidents closed 1,095 days, attachments of tickets resolved more than N months (disabled by default), and **audit IP personal data** through destruction of `DAY` keys older than `audit_ip_retention_days` (default 365).
- **The audit log itself is never deleted** (SEC-78 stays true); only the key destruction renders old unauthenticated-traffic IPs unreadable.
- `POST /api/admin/retention/dry-run` returns counts per class without deleting; the scheduled job runs daily, deletes in bounded batches, and writes one summary audit entry `RETENTION_RUN` (class and counts); changes to a policy are audited with old and new values and require step-up.
- Hard floors prevent foot-guns (for example security events cannot go below 7 days, `ADMIN`-related audit data is out of scope); policies cannot be set to zero except by disabling the class.
- Replace `maintenance/purge.ts` and its tests with the engine, keeping the existing behaviour tests green.

📚 Source: backlog SD-191 (Epic 37) · provenance [STANDARD] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE, DB)

### ✅ Acceptance Criteria

- [ ] A dry run lists counts without changing data; the real run deletes only rows beyond the retention (fake clock) and writes one summary entry (SEC-224).
- [ ] `audit_log` rows are never deleted; destroying a daily key makes that day's unauthenticated IPs show `[erased]` while the chain verifies (SEC-224).
- [ ] Policy changes are audited with old and new values and refused below the floors.
- [ ] The previous purge behaviour tests still pass under the engine.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 37.1 (SD-188)
SDISSUE_EOF
create_issue 7 '[Task 37.4] Retention policy engine' 'Module 7: Helpdesk and Data Protection' 'backend,database,security,high-priority,epic:privacy' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

One reviewed way to encrypt sensitive values, with key versions and rotation, replacing ad-hoc AES use.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- `server/crypto/envelope.ts`: AES-256-GCM with a random 96-bit nonce; a fresh data key per value (or per file) wrapped by a **key-encryption key** from a key ring; ciphertext format `v1:<kekId>:<wrappedDek>:<nonce>:<ciphertext>:<tag>` (base64url fields); additional authenticated data binds table, column and row id so a ciphertext cannot be moved to another row (SEC-225).
- Key ring: JSON file at `ENCRYPTION_KEYRING_PATH` (mode `0600`, outside the data directory, checked with `private-file.ts`), entries `{ id, key (base64, 32 bytes), createdAt, status: active|retired }`; `ENCRYPTION_ACTIVE_KEY_ID` selects the key for new writes; production refuses a missing, loose-mode or placeholder ring; a pluggable provider interface leaves room for a cloud KMS (documented, not implemented).
- Migrate existing secrets: TOTP secrets (currently `TOTP_ENCRYPTION_KEY` AES-GCM), webhook subscription secrets, and the wrapped subject keys of SD-190; a one-off migration re-encrypts existing TOTP values with a dry-run mode and a verification pass; the old env key is accepted only for reading during the migration window.
- Rotation: `npm run crypto:rotate` adds a new active key and re-wraps all data keys in batches (payloads are untouched), reports progress, is resumable and audited (`CRYPTO_KEY_ROTATED`, key ids only); `crypto:verify` decrypts a sample of every class; a retired key may be removed only when the scan finds no value referencing it.
- Wrong key, tampered ciphertext, moved ciphertext and truncated input all fail closed with a generic error and never log the value.

📚 Source: backlog SD-192 (Epic 37) · provenance [STANDARD] [HARDENING] · priority P0

📏 Estimated size of issue: L (3-5 person-days, BE)

### ✅ Acceptance Criteria

- [ ] After rotation every value decrypts with the new active key, and removing the old key after the scan loses nothing (SEC-225).
- [ ] Moving a ciphertext to another row, altering one byte or using the wrong key fails closed (SEC-225).
- [ ] Existing TOTP users keep working after the migration; production start-up refuses an unsafe key ring.
- [ ] The key ring and plaintext secrets never appear in logs, errors, exports or the database.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 21.4 (SD-107)
SDISSUE_EOF
create_issue 7 '[Task 37.5] Envelope encryption, key ring and rotation' 'Module 7: Helpdesk and Data Protection' 'backend,security,high-priority,epic:privacy' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Encrypt stored files and give people and administrators the screens for their privacy rights.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Attachment promotion (SD-172) encrypts the file with a per-file data key through a streaming AES-256-GCM format (chunked, 64 KB records with per-chunk authentication and a final-chunk marker to detect truncation); the data key is wrapped by the key ring and stored in `ticket_attachments`; downloads decrypt while streaming; **scanning always happens on plaintext before encryption** (SEC-226).
- Re-encryption of files that were stored before this task, as a resumable job.
- Angular `/account/privacy`: "Download my data" (step-up), "Request erasure" with an explanation of what is erased, what remains (records the organisation must keep) and the audit-log behaviour; status of the request.
- Angular `/admin/privacy`: erasure request queue with approve and reject (four-eyes banner), run, result summary; subject export with reason; retention policy view and editor with dry-run (SD-191); data inventory viewer generated from the JSON.
- Auditor read-only access to the queue and the retention view.

📚 Source: backlog SD-193 (Epic 37) · provenance [HARDENING] [PRODUCT] · priority P1

📏 Estimated size of issue: L (3-5 person-days, BE, FE)

### ✅ Acceptance Criteria

- [ ] A file on disk is not equal to the uploaded bytes and decrypts correctly on download; a truncated or altered stored file fails closed (SEC-226).
- [ ] An infected file is detected before encryption (EICAR test) and never stored (SEC-226).
- [ ] A user can request erasure and sees the status; only an Administrator can approve and run it; the Auditor sees the queue read-only.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

Task 37.5 (SD-192), Task 33.5 (SD-172), Task 37.2 (SD-189), Task 37.3 (SD-190)
SDISSUE_EOF
create_issue 7 '[Task 37.6] Attachment encryption at rest and the privacy UI' 'Module 7: Helpdesk and Data Protection' 'backend,frontend,security,medium-priority,epic:privacy' "$BODY"
IFS= read -r -d '' BODY <<'SDISSUE_EOF' || true
### 🎯 Objective

Close the programme: everything verified, documented and released as a coherent product.

### 🛠️ Technical Implementation Details

Section numbers below refer to `docs/course/backlog-module-7.md`; Modules 1 to 3 cover tasks 1.1 to 18.5, Modules 4 to 7 cover tasks 19.1 to 37.7.

- Add SEC-189 to SEC-228 to `docs/testing.md` and `docs/asvs.json`; extend the threat model with section 8's table; update `docs/architecture.md`, `docs/permissions.md`, `docs/database-schema.md`.
- Full-product E2E journey: a Guest files a ticket with an attachment (scanned), a Manager sets priority and sees the SLA clock, an Employee comments (public and internal) and the Guest sees only the public one live, search finds the ticket for the right people, the Manager exports the weekly report, the Guest requests erasure, the Administrator approves and runs it, and audit verification still reports intact.
- Final README rewrite (features by area, the security controls table generated from `docs/testing.md`, architecture diagrams, the demo recording refreshed with the new journeys), `docs/case-study-privacy-vs-audit.md` (how erasure and an append-only chain coexist), and a roadmap section.
- Tag `v2.0.0` and let the release pipeline (SD-103) produce signed images, SBOM and provenance.

📚 Source: backlog SD-194 (Epic 37) · provenance [FOUNDATION] [PORTFOLIO] · priority P0

📏 Estimated size of issue: M (1-2 person-days, Docs, QA)

### ✅ Acceptance Criteria

- [ ] The full-product E2E passes three consecutive runs on CI; ZAP baseline, CodeQL, gitleaks and Trivy are green.
- [ ] SEC-01 to SEC-228 map to real test titles; the ASVS and traceability checks are green.
- [ ] `v2.0.0` release exists with signed artifacts; the README quick start works from a clean clone in under 10 minutes.
- [ ] Minimum 80% test coverage for this module.

### 🔗 Dependencies

all P0 tasks of Module 7
SDISSUE_EOF
create_issue 7 '[Task 37.7] Module 7 verification, final documentation and project release' 'Module 7: Helpdesk and Data Protection' 'documentation,testing,high-priority,epic:privacy' "$BODY"

echo "Done: labels, milestones and issues processed in $REPO (created: $CREATED, skipped: $SKIPPED)."
