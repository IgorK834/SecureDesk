









SecureDesk — Module 1 Implementation Backlog
Course: Cybersecurity
Assignment: Module 1 — Identification, Authentication, and Authorization
Individual variant: No. 2
Application: SecureDesk — a security-oriented internal helpdesk / ticket-management application
Stack: Angular (frontend), Next.js (API backend), SQLite (database)
Status: Implementation specification / actionable product backlog
Language: English

0. How to use this document
This document is intended to be an executable implementation plan, not just a feature wishlist. Each backlog item includes its objective, implementation tasks, acceptance criteria, and dependencies. Items are labeled SD-01 through SD-32 to match the initially proposed backlog.

Requirement provenance
[ASSIGNMENT] — explicitly required by the supplied Module 1 — Identification, Authentication, and Authorization PDF.
[VARIANT 2] — explicitly required by row 2 of the individual variants table on page 2 of the PDF.
[DESIGN] — proposed implementation decision to make the project cohesive, demonstrable, and extensible. It is not an additional course requirement.
[HARDENING] — security measure proposed beyond the document's explicit feature list; included in the baseline where needed to build a sound authentication system.
[OPTIONAL] — can be postponed without claiming it is part of mandatory Module 1 functionality.
Priorities
Priority	Meaning	Completion expectation
P0 — Required	Mandatory assignment/variant functionality or indispensable technical foundation	Must be implemented for Module 1 completion
P1 — Recommended	Small extension, security hardening, or demonstrator supporting future development	Implement after P0 or alongside related P0 work
P2 — Optional	Extra-credit or explicitly deferred functionality	Implement only when the P0 scope is complete
Important scope rule: the course-required product is the identity, authentication, authorization, and session management system. The helpdesk domain is an application theme proposed for this project. Only a very small ticket demonstrator is planned for Module 1; a full helpdesk product is outside the scope of the first submission.

1. Original assignment: authoritative requirements
1.1 Project characteristics
The supplied PDF describes an incremental project: the application created in Module 1 must be designed for extension in Modules 2 and 3. The PDF specifically emphasizes the data model, session management, and authorization layer as foundations that should be considered from the beginning. A web application is recommended because later modules are expected to use browser-based CAPTCHA mechanisms. The complete requirements of Modules 2 and 3 have not been provided; do not invent those requirements or mark proposed future features as mandatory.

1.2 Mandatory functionality from section 3 of the PDF
Ref.	Assignment requirement	Implementation consequence
A-01	Login using a login identifier and masked password; show “Login lub hasło niepoprawne” for invalid credentials; store salted password hashes	Angular login form; credential verification on server; generic error message; Argon2id
A-02	On first login, force a password change from the administrator-assigned password; require the new password twice	Restricted initial-login state; initial password change page; repeated new-password validation
A-03	Ordinary password changes require the old password; new passwords must comply with the individual policy and differ from previous passwords	Secure password change endpoint and password history checks
A-04	Admin panel: list, add, edit, block, and delete users; toggle the individual password policy; configure password lifetime in days and session inactivity time	Admin-only user and security settings API/UI
A-05	Administrator assigns a time-limited one-time password on user creation or password reset, using the individual variant's format	Cryptographically generated temporary initial/reset password with expiry
A-06	Implement the roles and permissions required by the selected variant	Database-backed RBAC and protected API endpoints
A-07	Manual logout and automatic logout after inactivity	Server-side session expiry and client UX
A-08	TOTP two-factor authentication for a higher grade	Optional extra-credit feature; not part of the P0 completion gate
Terminology: the PDF uses one-time password for the administrator-issued temporary password. In this backlog that is called a temporary password. It is not the same mechanism as time-based one-time passwords (TOTP), which are an optional second authentication factor.

1.3 Individual variant No. 2 — exact constraints
Dimension	Required value
Minimum regular password length	12 characters by default
Extra password-policy rule	When enabled by the admin, a password must not contain the user's login, first name, or last name, case-insensitively
Required number of test users	6 test users
Required roles	Administrator, Manager (Kierownik), Employee (Pracownik), Guest (Gość)
Administrator-issued temporary password	16 characters, including letters, digits, and special characters
Temporary password validity	12 hours
Course-versus-design clarification: The general assignment describes an administrator and a regular user, whereas the individual variant prescribes four roles. Implement all four variant roles. The permanent account ADMIN is assigned the Administrator role. For an unambiguous test fixture, create six non-admin test accounts plus ADMIN. This is a conservative project decision; the PDF does not explicitly state whether the admin is included in the count of six.

1.4 Fixed administrator account
ADMIN is the application's permanent administrative login, as required by section 3 of the PDF. Proposed safeguards: the account is seeded exactly once, cannot be renamed, deleted, blocked, or downgraded through the UI or API, and has no hard-coded default password in the repository. Its initial secret must be provided through a secure bootstrap process and changed on first login.

1.5 Required reporting deliverable
The PDF additionally requires a PDF report containing:

A theoretical introduction written in the student's own words.
Completed exercises, technologies used, the hashing algorithm and justification, database schema, variant number, role-permission matrix, and important code excerpts.
Screenshots demonstrating at least: unsuccessful login, forced password change, a hash in the database, admin panel, temporary password, HTTP 403 response, and inactivity logout.
Answers to the four control questions in section 5 of the source PDF.
Conclusions.
A repository link or a source-code archive.
The control questions concern: (1) why not to write one's own cryptography and two easy implementation mistakes, (2) why SHA-256 is unsuitable for password storage compared with Argon2id and what a salt does, (3) why NIST discourages composition rules and periodic changes, and (4) why hiding UI controls is not authorization.

2. Product vision and Module 1 boundaries
2.1 Proposed target application: SecureDesk
SecureDesk will eventually be a small internal helpdesk used by a fictitious organization. Users will submit tickets, employees will process assigned tickets, managers will coordinate assignments, and administrators will manage accounts and security policy. It is intentionally simple: the differentiator is secure identity and access management, not sophisticated business features.

2.2 Intended future capabilities — proposals only
Module 2 candidate scope: CAPTCHA and anti-automation protections, increased login abuse resistance, security event collection, and security-focused UI states.
Module 3 candidate scope: security event review, MFA extensions, permission audits, abuse detection, and additional protected business workflows.
Long-term product scope: richer ticket lifecycle, file attachments with secure handling, notification workflows, report dashboards, and audit views.
These are possible development directions, not verified statements about the subsequent course assignments. The system must permit extensions without requiring them now.

2.3 Module 1 in scope
Monorepo setup with Angular + Next.js API + SQLite.
User and role data model and schema migrations.
Seeded permanent ADMIN and six test users.
Secure login, initial password change, normal password change, password history, password reset.
Correct temporary passwords for variant 2 (16 characters, 12 hours).
Default minimum password length of 12, configurable safe floor, and the variant's toggleable rule.
Server-enforced access controls for all protected endpoints.
Admin user management and configurable security settings.
Secure cookie-backed sessions; manual logout and idle timeout.
Minimal role-aware dashboard and a tiny ticket demonstration to exercise object-level access checks.
Automated security-focused tests and the required report artifacts.
2.4 Out of scope for Module 1
A full issue-tracking workflow with comments, file attachments, SLAs, notifications, analytics, and email integration.
Public self-registration and social login (the admin creates accounts).
Multi-tenancy and separate customer organizations.
Public internet production deployment unless explicitly requested by the lecturer.
A full SIEM or production-grade security monitoring solution.
CAPTCHA as a mandatory first-module requirement (the PDF only indicates future browser-based use).
TOTP as a P0 item (it is specifically extra credit).
3. Architecture and conventions
3.1 Chosen architecture
┌──────────────────────────────────────────────┐
│ Browser                                      │
│ Angular SPA                                  │
│ - Login, password change, dashboards         │
│ - Admin users/settings                       │
│ - Route guards and reactive forms            │
└──────────────────────┬───────────────────────┘
                       │ HTTPS, JSON, cookies
                       ▼
┌──────────────────────────────────────────────┐
│ Next.js API (Node.js runtime)                │
│ - Route Handlers: /api/**                    │
│ - Auth & session service                     │
│ - RBAC/ownership policies                    │
│ - Password policy and cryptographic libraries│
│ - Zod validation and error mapping           │
└──────────────────────┬───────────────────────┘
                       │ Drizzle ORM
                       ▼
┌──────────────────────────────────────────────┐
│ SQLite database                              │
│ - Users, roles, permissions                  │
│ - Password history, sessions, settings       │
│ - Minimal ticket resources                   │
└──────────────────────────────────────────────┘
Angular is the only UI. Next.js is used only as a Node.js API backend in this architecture; no React frontend and no Next.js page-based UI are required. This use of Next.js is a deliberate stack decision, not a course requirement.

3.2 Suggested libraries and tools
Concern	Selected technology	Why
Frontend	Angular + TypeScript	SPA, reactive forms, guards, typed API clients
Backend	Next.js Route Handlers + TypeScript + Node.js runtime	Small REST API without an additional backend framework
Database	SQLite	Easy local reproducibility and persistence
ORM/migrations	Drizzle ORM + better-sqlite3	Typed schema and versioned database changes
Password hashing	Maintained Argon2 library; Argon2id	Salted, intentionally expensive password hashes
API validation	Zod	Explicit input constraints at the trust boundary
API testing	Vitest or equivalent	Password/session/permissions unit and integration tests
Browser testing	Playwright	Repeatable role and session end-to-end flows
Version control	Git	Auditable increments and reproducible setup
Do not pin versions here without checking compatibility when starting development. Record the exact installed versions in package manifests and lockfiles.

3.3 Repository structure
securedesk/
├── apps/
│   ├── frontend/                     # Angular
│   │   └── src/app/
│   │       ├── core/
│   │       │   ├── auth/
│   │       │   ├── http/
│   │       │   └── guards/
│   │       ├── features/
│   │       │   ├── login/
│   │       │   ├── password/
│   │       │   ├── admin-users/
│   │       │   ├── admin-security/
│   │       │   ├── dashboard/
│   │       │   └── tickets/         # Minimal demo only
│   │       └── shared/
│   └── backend/                      # Next.js API-only app
│       ├── src/app/api/
│       │   ├── health/
│       │   ├── auth/
│       │   ├── admin/
│       │   └── tickets/
│       └── src/server/
│           ├── auth/
│           ├── users/
│           ├── permissions/
│           ├── security/
│           ├── tickets/
│           └── db/
│               ├── schema/
│               ├── migrations/
│               └── seeds/
├── docs/
│   ├── architecture.md
│   ├── database-schema.md
│   ├── permissions.md
│   ├── threat-model.md
│   └── report-evidence/
├── tests/
├── .env.example
├── .gitignore
├── README.md
└── backlog.md
Adapt the layout to the chosen package manager/workspace tooling. The principal rule is to keep security decisions on the backend, separated into reusable services rather than duplicated across route handlers.

3.4 Runtime and origin policy
During development, Angular may run at localhost:4200 and the API at localhost:3000, with Angular's /api proxy forwarding requests to the backend.
All application requests should use /api/... relative URLs through the proxy.
Production-like hosting should place Angular and the API behind one HTTPS origin to simplify cookie security and eliminate unnecessary cross-origin exposure.
Host SQLite on a persistent filesystem where the backend runs as a persistent Node.js process; do not depend on ephemeral filesystem storage in a serverless deployment.
Secrets, database files, environment-specific credentials, and .env files must never be committed.
3.5 Backend design rules
Validate every incoming request on the server.
Require authentication by default for protected routes.
Apply deny-by-default authorization: permission missing means access denied.
Enforce permissions on every backend operation, including direct requests that bypass Angular.
Verify object ownership and assignment, not just the user's role.
Do not reveal password hashes, session token values, or temporary passwords in normal API responses, URLs, or logs.
Use parameterized SQL via the ORM; never interpolate untrusted SQL fragments.
Make password and session state transitions transactional where multiple records must change together.
Prefer explicit, typed service functions such as requireSession, requirePermission, canReadTicket, validateNewPassword, and revokeSessions.
Ensure browser routing and visible controls are only UX aids; the backend is the authority.
4. Domain model and SQLite schema
All table names below are proposed design, except that the assignment requires the underlying capabilities. Exact columns may evolve during implementation if invariants remain satisfied.

4.1 users
Field	Suggested type	Constraints / purpose
id	TEXT UUID	Primary key, generated by server
login	TEXT	Required; unique case-insensitively; immutable for ADMIN
first_name	TEXT	Required; used by variant-2 password rule
last_name	TEXT	Required; used by variant-2 password rule
role_id	TEXT	Foreign key to roles.id
password_hash	TEXT	Required; Argon2id encoded hash; never plaintext
must_change_password	INTEGER/BOOLEAN	Required; true for administrator-issued credentials
temporary_password_expires_at	INTEGER/TIMESTAMP nullable	Enforces the 12-hour temporary-password lifetime
password_changed_at	INTEGER/TIMESTAMP nullable	Required for optional ordinary password expiration
is_blocked	INTEGER/BOOLEAN	Default false
deleted_at	INTEGER/TIMESTAMP nullable	Soft deletion so relations and evidence remain consistent
created_at	TIMESTAMP	Creation time
updated_at	TIMESTAMP	Last account modification
Invariant: ADMIN must continue to exist, keep the Administrator role, and never be blocked or soft-deleted. Enforce these rules at the API/service layer and consider DB constraints where feasible.

4.2 roles, permissions, role_permissions
roles: id, name, description; seed exactly four variant roles.
permissions: id, code, description; use stable machine-readable codes.
role_permissions: role_id, permission_id, with a composite unique constraint.
Each user needs one role in Module 1. Multiple simultaneous user roles are not required by the PDF; a single role simplifies reasoning and testing.
Seed roles/permissions idempotently. Do not accept arbitrary permission strings from the frontend.
Suggested permission codes:

users:read
users:create
users:update
users:block
users:delete
users:reset-password
security-settings:read
security-settings:update
tickets:create
tickets:read:all
tickets:read:assigned
tickets:read:own
tickets:assign
tickets:status:update:all
tickets:status:update:assigned
The service layer must combine permissions with ownership checks where codes contain own or assigned.

4.3 password_history
Field	Purpose
id	Record identifier
user_id	Foreign key to user
password_hash	Previously used, salted Argon2id hash
created_at	When this hash became historical
Design decision: prohibit reuse of the current regular password and the five most recent regular passwords. The PDF requires checking previous passwords but does not specify a count. Never store old plaintext passwords. Use Argon2id verification against stored hashes to detect reuse, even though individual salts produce different hash strings. Temporary passwords need not count as regular passwords in this history.

4.4 sessions
Field	Purpose
id	Internal database row ID
user_id	Session owner
token_hash	Deterministic hash of a cryptographically random, high-entropy opaque token
created_at	Creation time
last_activity_at	Last accepted server activity
expires_at	Optional absolute expiry / safety limit
revoked_at	Revocation timestamp; null while active
auth_stage	INITIAL_PASSWORD_CHANGE, PASSWORD_EXPIRED, or FULLY_AUTHENTICATED
The browser receives the raw opaque session token only through a cookie. The database stores its digest. A fast cryptographic hash is appropriate for a high-entropy random session token; the same approach is not appropriate for human passwords.

4.5 security_settings
For this student application, one global settings row is enough:

Setting	Initial value	Behavior
min_password_length	12	Enforced for regular user-selected passwords; API must not allow less than 12 for variant 2
reject_personal_data_in_password	false	Administrator can enable/disable the additional variant-2 restriction
password_max_age_days	null / 0 = disabled	Administrator may set a positive number of days if the course exercise needs expiry
session_idle_timeout_minutes	15	Proposed initial value; administrator may change it
updated_at, updated_by	System metadata	Useful for explaining setting changes
Why disabled expiry by default? The PDF requires a configurable maximum password age, not a particular default, and its theory section discusses NIST's recommendation against routine password rotation. The exact default and permitted UI range are project decisions. Temporary passwords always expire after 12 hours, regardless of this setting.

4.6 tickets — minimal authorization demonstrator
Field	Purpose
id	Primary key
title	Short title
description	Simple text; no HTML uploads
status	OPEN, IN_PROGRESS, RESOLVED
created_by_user_id	Owner/submitter
assigned_to_user_id	Nullable staff assignee
created_at, updated_at	Timestamps
Only the smallest API/UI needed to demonstrate role-based and object-based authorization should be implemented in Module 1. The ticket domain is proposed, not specified in the PDF.

4.7 Database-level requirements
Enable SQLite foreign keys.
Use migrations, not manually edited production schema.
Add unique indexes to normalized login and session token digest.
Add indexes to sessions.user_id, sessions.last_activity_at, password_history.user_id, ticket ownership/assignee fields.
Avoid destructive migration behavior and ensure repeatable startup/seed execution.
The database file must live outside any public/static frontend directory.
Keep local development/test databases separate and exclude them from Git.
Preserve integrity when blocking/deleting accounts: invalidate their sessions and maintain ticket foreign keys through soft deletion.
5. Role and permission matrix
The PDF requires a self-designed matrix following the principle of least privilege; the matrix below is a proposed project decision and must be copied into the final report.

Action	Administrator	Manager	Employee	Guest
List/read user accounts	Yes	No	No	No
Create/edit/block/delete user accounts	Yes	No	No	No
Reset another user's password	Yes	No	No	No
Read/change global security settings	Yes	No	No	No
Change own regular password	Yes	Yes	Yes	Yes
Create a ticket	No	Yes	Yes	Yes
Read all tickets	No	Yes	No	No
Read tickets assigned to self	No	Yes	Yes	No
Read tickets created by self	No	Yes	Yes	Yes
Assign a ticket to an employee	No	Yes	No	No
Update status of any ticket	No	Yes	No	No
Update status of an assigned ticket	No	Yes	Yes	No
Important: the Administrator role is intentionally not a universal ticket reader. It manages identities and system security, not the contents of employees' or guests' business data. That separation is a deliberate least-privilege decision and can be reconsidered later if future requirements specify otherwise.

5.1 Expected authorization semantics
401 Unauthorized: no valid active authentication session.
403 Forbidden: a logged-in user does not have a required permission.
404 Not Found: resource does not exist or its existence must not be disclosed to an unauthorized resource viewer (choose a consistent documented object-access policy).
400 Bad Request: malformed input or invalid field constraints; use a consistent validation response.
409 Conflict: duplicate login or incompatible account state, if applicable; do not reveal sensitive information through public authentication endpoints.
429 Too Many Requests: rate-limit threshold reached.
User-specific ownership checks must occur even if the user has a broadly related role.
6. Authentication, password, and session rules
6.1 Normal login flow
Angular displays a login field and masked password field.
User submits credentials over HTTPS (or localhost during development) to POST /api/auth/login.
Backend validates shape and normalizes the login for lookup; do not modify the password unexpectedly.
Backend finds the account; blocked/deleted/non-existent accounts must not produce username-enumerating responses.
Backend verifies the submitted password with Argon2id.
On failure, the visible response is exactly Login lub hasło niepoprawne.
On success, backend checks temporary password age, regular password age, and required password-change state.
Backend creates a random opaque session token and stores its digest in SQLite.
Backend sets a secure, HTTP-only cookie and returns only safe user/session flags.
Angular navigates either to the forced password change page or to the role-specific dashboard.
6.2 Administrator-issued temporary password
Length is exactly 16 characters.
The alphabet must include letters, digits, and special characters; generator output must contain at least one character from each required group.
Generate with a cryptographically secure randomness API (for example, Node.js crypto), not Math.random().
Do not expose a static default password or repeatable seed-based secrets.
Password becomes invalid 12 hours after issuance; compare server-side UTC timestamps.
The admin receives the plaintext only in the direct creation/reset response, displayed once with a clear “copy/store now” instruction.
Store only an Argon2id hash of that password.
Never include plaintext in audit logs, error logs, URLs, analytics, browser local storage, or database records.
Newly issued or reset credentials set must_change_password = true.
Expired unused temporary credentials require another admin reset.
6.3 Initial password change
A successful login using valid temporary credentials creates a restricted session in the INITIAL_PASSWORD_CHANGE state.
Only GET /api/auth/me, initial password change, and logout may be used in that state; all state-changing requests still require CSRF protection.
Redirect to /change-initial-password regardless of the attempted protected route.
UI contains New password and Confirm new password; they must match.
Enforce variant 2 and the current password settings on the backend.
Verify that the new password is different from the current temporary password and check it against historical regular-password hashes.
Atomically install the new Argon2id hash, clear temporary expiry, set must_change_password = false, update password_changed_at, and transition authentication to a fully authenticated session (preferably rotate the session identifier).
Other old sessions are invalidated; success navigates to the correct dashboard.
The user must not be able to bypass this workflow by typing a protected URL or calling the API directly.
6.4 Ordinary password change
Requires an authenticated, fully enabled account and the current (old) password.
Requires the new password and repeat/confirmation in the Angular form.
Old password is verified by the backend.
New password is different from the current password and previous five regular passwords (project decision).
Validates minimum length and optionally the login/first-name/last-name substring restriction.
Checks against a small local prohibited-password list as an additional baseline safeguard suggested by the PDF's theory section; a breach-database API is not variant-2 homework.
After a successful change, write the new salted hash, update history, and invalidate previous sessions; issue a fresh full session after successful change, including when resolving PASSWORD_EXPIRED.
A failed operation must not partially update a password or its history.
6.5 Variant-2 personal-data restriction
When reject_personal_data_in_password = true:

Reject a candidate if it contains the entire non-empty login, first name, or last name as a substring.
Matching is case-insensitive. For example, with first name Anna, MyANNApassword2026! must be rejected.
Evaluate using a documented, consistent Unicode normalization/case-insensitive comparison strategy; do not require exact letter case.
Reject on the backend, even when JavaScript validation is bypassed.
Display a generic but actionable validation reason in the password-change UI; do not leak other users' profile data.
When the toggle is off, the additional personal-data check is not applied; the minimum-length and other baseline checks still apply.
No upper/lowercase/digit/symbol composition requirement is imposed on regular passwords solely because the temporary password format requires it. This distinction matters for NIST-aligned behavior.
6.6 Password validity in days
Admin can view and set password_max_age_days to disabled or a positive integer within a documented, safe range.
When enabled, compare the current time against password_changed_at on the server.
An expired regular password should create a restricted PASSWORD_EXPIRED session after successful credential verification. In that state, only /api/auth/me, /api/auth/change-password, and logout are available; the password change still requires the old password. The existing ordinary change endpoint must explicitly support this stage, while all other business/admin APIs remain blocked.
This is separate from the fixed 12-hour validity of administrator-issued temporary passwords.
Document that periodic password expiration is implemented for the exercise and is not a blanket modern-security recommendation.
6.7 Session inactivity and logout
Default idle threshold: 15 minutes (project choice); admin can configure it.
On every protected API request, validate server-side inactivity using last_activity_at, user state, and revocation state.
A successful, authorized interaction refreshes server-tracked activity; do not rely only on mouse movement or a client-side timer.
Rejected requests should not silently keep a session alive indefinitely.
Logout revokes the session in SQLite and clears the cookie.
After idle timeout, server rejects the old session regardless of whether Angular is still open.
Angular handles 401 consistently by clearing local auth state and navigating to login with a neutral session-expired message.
Password reset, account blocking, account deletion, and password change must revoke existing sessions according to the specified flows.
Do not store bearer tokens in localStorage or sessionStorage.
6.8 Cookie and request protection
Use an opaque random session value with sufficient entropy; store only its digest server-side.
Cookie settings: HttpOnly, Secure under HTTPS, SameSite=Lax or stricter, host-only (no unnecessary Domain attribute), and Path=/.
Where valid in the hosting environment, prefer a __Host- cookie prefix in HTTPS deployments.
Add a CSRF strategy for state-changing requests: verify same-origin Origin/Referer where appropriate and use a server-issued CSRF token or other clearly documented defense. SameSite alone is not a complete design justification.
Limit request body size; validate Content-Type where applicable.
Do not enable permissive credentialed CORS such as wildcard origins.
Apply appropriate HTTP security headers and avoid caching authenticated sensitive responses.
7. API contract (proposed implementation)
7.1 Standard response/error contract
Suggested error shape:

{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Login lub hasło niepoprawne"
  }
}
For fields validation, use an allowlisted set of safe field errors. Never return raw SQL errors, stack traces, password hashes, session token values, or secret configuration.

7.2 Authentication endpoints
Method	Route	Authentication	Main behavior
GET	/api/health	Public	Minimal health response; no secrets
POST	/api/auth/login	Public + rate-limited	Verify credentials, create session
GET	/api/auth/me	Session	Return safe user profile, role, and auth-stage flags
POST	/api/auth/logout	Session + CSRF	Revoke session and clear cookie
POST	/api/auth/change-initial-password	Restricted initial-change session + CSRF	Validate two new password entries and transition account/session
POST	/api/auth/change-password	Full or PASSWORD_EXPIRED session + CSRF	Verify old password and install new password; elevate a successful expiry-restricted session
Example request bodies:

// POST /api/auth/login
{ "login": "employee1", "password": "provided-secret" }

// POST /api/auth/change-initial-password
{ "newPassword": "new-private-value", "confirmNewPassword": "new-private-value" }

// POST /api/auth/change-password
{
  "currentPassword": "previous-private-value",
  "newPassword": "new-private-value",
  "confirmNewPassword": "new-private-value"
}
The password placeholders are documentation only; never put real secrets in examples committed to the repository.

7.3 Administrator endpoints
Method	Route	Required permission	Main behavior
GET	/api/admin/users	users:read	Paginated/filterable account list
POST	/api/admin/users	users:create	Create user; issue temporary password once
GET	/api/admin/users/:id	users:read	Read safe user details
PATCH	/api/admin/users/:id	users:update	Update first/last name and role; validate transitions
POST	/api/admin/users/:id/block	users:block	Block and revoke sessions
POST	/api/admin/users/:id/unblock	users:block	Restore login eligibility; do not restore old sessions
DELETE	/api/admin/users/:id	users:delete	Soft-delete and revoke sessions
POST	/api/admin/users/:id/reset-password	users:reset-password	Issue new 16-character password; expire in 12 hours
GET	/api/admin/security-settings	security-settings:read	Return current safe security settings
PATCH	/api/admin/security-settings	security-settings:update	Validate and persist settings
Anti-enumeration exception: admin-authenticated account-management pages naturally show account data, but the public login API must not reveal existence, disabled state, or deletion state.

7.4 Minimal ticket authorization endpoints
Method	Route	Authorization behavior
GET	/api/tickets	Manager: all; employee: own/assigned; guest: own; admin: forbidden
POST	/api/tickets	Manager/employee/guest may create own ticket
GET	/api/tickets/:id	Resource-level read check before returning content
PATCH	/api/tickets/:id/status	Manager: any; employee: assigned only
PATCH	/api/tickets/:id/assignee	Manager only; assignee must be a valid employee
Do not add complex ticket workflows to Module 1. These endpoints are proposed so the four roles produce meaningful, testable authorization differences.

7.5 API design conventions
Return consistent HTTP status codes; 401 is different from 403.
Use UUIDs or other non-sequential identifiers where practical, but never treat difficult-to-guess IDs as authorization.
Add pagination or safe limits to list endpoints.
Allowlist editable fields so clients cannot set password_hash, is_blocked, role_id, or other sensitive fields through unexpected payloads.
All /api/admin/** routes must independently enforce admin permissions.
Verify role and account state on the server at request time; do not rely on a stale JWT claim or Angular route guard.
Use one shared API validation/error mapping pattern.
8. Detailed implementation backlog
EPIC 1 — Project foundation and data model
SD-01 — Initialize the monorepo and establish Angular–Next.js communication
Priority: P0 — Required foundation
Labels: [DESIGN], foundation, frontend, backend
Depends on: None
Implementation checklist

Initialize Git repository, root workspace, and lockfile.
Create Angular SPA inside apps/frontend with routing and a minimal layout.
Create Next.js API-only application inside apps/backend using the Node.js runtime.
Create GET /api/health returning a minimal JSON response.
Configure frontend /api proxy for local development and relative-path API calls.
Add root scripts for dev, build, lint, test, DB migration, and DB seed.
Configure TypeScript strict mode, ESLint, formatting, and .gitignore.
Add .env.example documenting required keys but containing no production secrets.
Create a brief README.md with prerequisites and startup commands.
Acceptance criteria

A new developer can clone and start frontend/backend using the README.
Angular can call /api/health successfully without browser CORS errors.
Frontend and backend build independently.
No credentials, database files, or .env secrets are tracked in Git.
SD-02 — Configure SQLite, Drizzle, and reproducible migrations
Priority: P0 — Required foundation
Labels: [DESIGN], database
Depends on: SD-01
Implementation checklist

Configure SQLite with a configurable persistent file path.
Add Drizzle schema definitions and migration scripts.
Define development/test DB paths and prevent accidental use of the same file.
Enable foreign keys; create unique constraints and indexes.
Implement migrations for all Module 1 tables in section 4.
Ensure seed/migration commands fail clearly on invalid DB configuration.
Document how to reset development/test data safely.
Acceptance criteria

Running migrations on an empty DB creates the entire expected schema.
Running the app twice does not destroy previously stored data.
Foreign key and uniqueness violations produce controlled errors.
The DB file is not served publicly and is ignored by Git.
SD-03 — Implement core users, roles, permissions, and session schema
Priority: P0 — Required
Labels: [ASSIGNMENT], [VARIANT 2], database, security
Depends on: SD-02
Implementation checklist

Implement the users, roles, permissions, and role_permissions tables.
Implement password_history, sessions, and security_settings tables.
Ensure account lifecycle fields support pending password changes, blocking, deletion, and expiry.
Define typed domain models and DB mappers; never expose DB records wholesale to client JSON.
Centralize role and permission code constants.
Document entity relationships in docs/database-schema.md.
Acceptance criteria

Every non-deleted user has exactly one valid variant-2 role.
Current and historical passwords can be represented only as hashes.
Restricted sessions and session revocation are supported by schema.
The report-ready entity diagram can be generated from the design.
SD-04 — Seed permanent ADMIN and six test users
Priority: P0 — Required
Labels: [ASSIGNMENT], [VARIANT 2], database, testing
Depends on: SD-03, SD-05, SD-08
Implementation checklist

Seed the four exact required roles: Administrator, Manager, Employee, Guest.
Seed permission codes and role-permission mappings.
Seed fixed administrator login ADMIN with Administrator role.
Bootstrap admin password securely from a local non-committed source; require first change.
Create six non-admin test accounts, covering all three non-admin roles (e.g. 2 managers, 2 employees, 2 guests).
Generate valid temporary credentials for each test account without committing plaintext passwords.
Make seeding idempotent (do not reset passwords on every app start).
Add a protected or local-only way to obtain initial demonstration credentials.
Acceptance criteria

Database contains ADMIN and six distinct non-admin users after a fresh seed.
All four required roles are represented.
All seeded accounts have salted password hashes and correct first-login flags.
Running seed again does not overwrite active real credentials.
No universal hard-coded demonstration password is present in the repository.
EPIC 2 — Authentication, credentials, and password policy
SD-05 — Implement Argon2id password hashing and verification
Priority: P0 — Required
Labels: [ASSIGNMENT], security, backend
Depends on: SD-01
Implementation checklist

Add a maintained Argon2 library and configure the Argon2id variant.
Provide hashPassword(plain) and verifyPassword(hash, candidate) abstractions.
Configure cost parameters according to accepted guidance and available development hardware; record the chosen parameters in the report.
Ensure unique per-password random salts through the library's standard encoded-hash format.
Reject empty/malformed inputs before passing them to password verification.
Keep plaintext only as long as necessary in the request lifecycle; never log it.
Add tests for correct password, incorrect password, and different hashes for the same plaintext.
Acceptance criteria

No stored plaintext, reversibly encrypted passwords, or raw SHA-256 passwords exist.
Two hashes of the same password are different due to independent salts.
The correct password verifies and an incorrect one fails.
Hashing configuration is explained in the report.
SD-06 — Implement backend login and safe failure behavior
Priority: P0 — Required
Labels: [ASSIGNMENT], authentication, backend
Depends on: SD-03, SD-05, SD-07
Implementation checklist

Create validated POST /api/auth/login endpoint.
Normalize login identification without changing the password string.
Query user without leaking whether an identifier exists.
Verify password using Argon2id and reject blocked/deleted accounts.
Detect expired temporary passwords and first-login password-change state.
Create a restricted/full session using the shared session service.
Use the exact required generic visible message “Login lub hasło niepoprawne” for invalid credentials.
Prevent credential or hash values from appearing in server logs and error responses.
Integrate login rate limiting from SD-27.
Acceptance criteria

Valid user receives a session cookie and safe profile response.
Invalid login and wrong password receive the same visible authentication error.
Blocked/deleted accounts cannot create active sessions.
Expired temporary passwords cannot create a usable session.
Direct API access cannot bypass the credential check.
SD-07 — Implement durable, server-side sessions
Priority: P0 — Required
Labels: [ASSIGNMENT], authentication, sessions
Depends on: SD-03
Implementation checklist

Generate cryptographically random opaque session tokens.
Store digest of token, user ID, auth stage, expiry/revocation/activity metadata in SQLite.
Set a secure HTTP-only cookie; configure deployment-specific Secure behavior correctly.
Implement requireSession() and requireFullSession() helpers and explicit restrictions for INITIAL_PASSWORD_CHANGE and PASSWORD_EXPIRED auth stages.
Validate blocked/deleted account status during session checks.
Implement GET /api/auth/me with safe user data only.
Implement POST /api/auth/logout with server-side revocation and cookie clearing.
Enforce session expiry on the backend; rotate tokens when changing the authentication stage.
Test revoked, idle-expired, missing, and malformed session tokens.
Acceptance criteria

Authenticated routes work with a valid cookie and reject requests without one (401).
Copied old cookie does not work after logout/revocation.
HttpOnly prevents reading cookie content with normal browser JavaScript.
Session state persists across backend restarts while SQLite data remains, subject to expiry.
No session token is stored in frontend local storage.
SD-08 — Generate and issue valid variant-2 temporary passwords
Priority: P0 — Required
Labels: [ASSIGNMENT], [VARIANT 2], authentication, admin
Depends on: SD-05, SD-03
Implementation checklist

Build a testable CSPRNG-based 16-character generator.
Include letters, digits, and special characters with at least one character from each required group.
Avoid modulo-biased character selection if generating random indexes manually; prefer secure library/API methods.
Hash generated temporary passwords with Argon2id.
Set expiry to creation/reset time plus 12 hours.
Set must_change_password = true when issuing.
Implement one-time plaintext reveal in admin create/reset response.
Ensure another admin cannot later retrieve the original plaintext from the database.
Test expiry using an injected clock rather than waiting 12 hours.
Acceptance criteria

Every generated value is exactly 16 characters and contains required categories.
A generated temporary password works within 12 hours and fails after expiration.
Plaintext appears only in its immediate secure admin response.
All generated temporary passwords require a first-login password change.
SD-09 — Enforce first-login password change
Priority: P0 — Required
Labels: [ASSIGNMENT], authentication, frontend, backend
Depends on: SD-06, SD-07, SD-08, SD-10, SD-11
Implementation checklist

Define restricted INITIAL_PASSWORD_CHANGE session state.
Add POST /api/auth/change-initial-password endpoint.
Add Angular /change-initial-password view and validation for two matching values.
Validate password policy and password history on the server, and reject any new password matching the current temporary password.
Forbid normal API calls while the account/session requires password change.
Atomically replace temporary credentials, clear temporary expiry, and update password-change state.
Rotate or replace the session to prevent reuse of restricted-session credentials.
Handle expired, concurrent, invalid, or already-completed change attempts cleanly.
Acceptance criteria

Newly created user is forced to change their password after first successful login.
Two different new-password entries are rejected.
The user cannot enter dashboards or admin/ticket APIs beforehand.
A successful change grants normal access according to the user's role.
Reusing the old temporary password after completion fails.
SD-10 — Implement variant-2 configurable password policy
Priority: P0 — Required
Labels: [VARIANT 2], security, backend
Depends on: SD-03
Implementation checklist

Implement central validateNewPassword(password, user, settings) function.
Enforce minimum length of 12 characters by default.
Add configurable reject_personal_data_in_password toggle.
When enabled, reject case-insensitive occurrences of login, first name, or last name.
Ensure policy is applied during initial change, ordinary change, and all operations setting a user-chosen password.
Preserve support for long passwords and spaces; do not force special-character composition for user-chosen passwords merely because temporary credentials require it.
Add a small local banned-password check as a recommended baseline; do not implement HIBP API as if this were variant 5.
Establish tests with capitalization differences, empty/short values, Unicode input, exact 12-character boundary, and toggle on/off.
Acceptance criteria

An 11-character password is rejected; a suitable 12-character password passes the length rule.
With toggle on, passwords containing the user's login/name/surname in any letter case are rejected.
With toggle off, those substrings do not trigger the additional restriction (other policy checks still apply).
Server rejects invalid passwords even if Angular validation is bypassed.
SD-11 — Implement secure password changes and password history
Priority: P0 — Required
Labels: [ASSIGNMENT], security, authentication
Depends on: SD-05, SD-07, SD-10
Implementation checklist

Add validated POST /api/auth/change-password endpoint.
Require the current password on each normal change.
Check confirmation and policy on server.
Verify the candidate against current and five historical regular-password hashes.
Implement correct history insertion/pruning transactionally.
Update password_changed_at and revoke older sessions.
Add tests for wrong old password, identical new password, historical reuse, and valid change.
Display usable and non-sensitive validation messages on frontend.
Acceptance criteria

Without the correct old password, change is rejected without modifying stored credentials.
Reuse of a current/recent regular password is rejected.
A compliant new password succeeds and is stored only as a new Argon2id hash.
Password history never stores plaintext and remains bounded to the chosen five previous regular passwords.
Previously revoked sessions cannot access protected routes.
EPIC 3 — Role-based and object-level authorization
SD-12 — Seed variant-2 roles and permission matrix
Priority: P0 — Required
Labels: [VARIANT 2], authorization, database
Depends on: SD-03
Implementation checklist

Create stable identifiers for Administrator, Manager, Employee, Guest.
Define fine-grained permissions in section 5.
Seed role_permissions mapping.
Add role-to-permission tests verifying each role's expected allows/denials.
Document the matrix with descriptions of object conditions.
Acceptance criteria

Every role has exactly the intended permissions.
Guest has no admin permissions; Employee cannot assign tickets; Manager cannot manage users.
Administrator can manage identities/settings but cannot read private tickets by default.
The matrix can be reproduced in the report.
SD-13 — Centralize authorization middleware/service checks
Priority: P0 — Required
Labels: [ASSIGNMENT], authorization, backend
Depends on: SD-07, SD-12
Implementation checklist

Implement shared requirePermission() / equivalent API guard helper.
Enforce authenticated session and full-authentication stage before checking business/admin permissions; permit only explicitly allowlisted credential-recovery routes for PASSWORD_EXPIRED/initial-change states.
Return 401 if no valid session and 403 for a valid account lacking permission.
Ensure all admin routes use the same security guard.
Deny unknown/undefined permissions instead of allowing access.
Build integration tests that call routes without Angular.
Acceptance criteria

A Guest calling /api/admin/users receives 403.
A request without session receives 401.
Hiding/adding DOM buttons does not change permission checks.
A newly introduced protected endpoint cannot accidentally skip authorization without violating test/code-review conventions.
SD-14 — Implement and test object-level authorization
Priority: P1 — Recommended demonstrator supporting meaningful RBAC
Labels: [DESIGN], authorization, tickets
Depends on: SD-12, SD-13, SD-03
Implementation checklist

Add minimal tickets table and migrations.
Add safe list/create/read/status/assignment handlers defined in section 7.4.
Filter list results at database-query level or through a verified access filter.
Enforce ticket-specific ownership and assignee checks for detail and mutation endpoints.
Validate that assignees are active users with Employee role.
Seed a handful of ownership/assignment scenarios for test accounts.
Ensure lack of ticket access does not reveal its content.
Acceptance criteria

Guest A cannot read Guest B's ticket by altering its ID.
Employee A cannot edit an unassigned ticket.
Manager can read all and assign eligible staff.
Administrator does not gain content access merely because of the administrator role.
No ticket endpoint returns records beyond the user's allowed scope.
SD-15 — Add role-aware Angular navigation and route guards
Priority: P0 — Required UI for role functionality
Labels: [ASSIGNMENT], frontend, authorization
Depends on: SD-07, SD-12, SD-13
Implementation checklist

Create a typed frontend auth/session state service based on /api/auth/me.
Define route guards for authenticated access and initial-password-change flow.
Create dashboard shells for admin, manager, employee, and guest.
Hide routes/buttons that the current role cannot use.
Add explicit 403 and 404 UX states.
Do not treat Angular route guards as sufficient backend authorization.
Acceptance criteria

Each role reaches an appropriate dashboard.
Non-admin users see no admin navigation links.
Entering an unauthorized Angular URL does not grant server access.
Reloading a page reconstructs the auth state from the server session.
EPIC 4 — Administrator features
SD-16 — Implement admin-only user list and account details
Priority: P0 — Required
Labels: [ASSIGNMENT], admin, frontend, backend
Depends on: SD-13, SD-04
Implementation checklist

Implement admin-only user list and detail API.
Display login, first/last name, role, block status, first-login status, and creation date.
Exclude password hashes and session tokens from response DTOs.
Add name/login filters and safe pagination or fixed limits.
Implement Angular Users table and account-detail screen/modal.
Acceptance criteria

Admin can list and inspect accounts.
Manager/Employee/Guest cannot access admin list API (403).
Sensitive credential fields never appear in serialized responses.
UI clearly distinguishes blocked, active, and pending-first-change states.
SD-17 — Create and edit user accounts
Priority: P0 — Required
Labels: [ASSIGNMENT], [VARIANT 2], admin
Depends on: SD-08, SD-13, SD-16
Implementation checklist

Create forms to enter login, first name, last name, and one of the three ordinary roles.
Check login uniqueness case-insensitively.
Generate, hash, and reveal a valid 16-character temporary password when creating a user.
Allow editing non-sensitive profile fields and valid role assignments.
Prevent mass-assignment of privileged DB fields from submitted JSON.
Prevent modifying protected ADMIN invariants.
Validate input lengths and data types on frontend and backend.
Acceptance criteria

Newly created account exists with correct role and must_change_password = true.
Temporary password is shown once and expires after 12 hours.
Duplicated login and invalid roles are rejected cleanly.
Only admin may add or edit users.
Existing accounts keep their unrelated fields and history during edits.
SD-18 — Block, unblock, and delete user accounts
Priority: P0 — Required
Labels: [ASSIGNMENT], admin, sessions
Depends on: SD-07, SD-13, SD-16
Implementation checklist

Add block/unblock endpoints and confirmation UX.
Revoke all active sessions when an account is blocked.
Make blocked login attempts fail with generic public authentication response.
Implement deletion as soft deletion to preserve relational integrity.
Revoke all sessions and prevent further login after deletion.
Prevent deleting, blocking, or downgrading ADMIN.
Add tests for session invalidation, repeat block calls, and protected administrator actions.
Acceptance criteria

Blocked account can no longer use an old session or log in.
Unblocked account can log in again with appropriate valid credentials; revoked old sessions remain invalid.
Deleted account cannot access the system.
ADMIN cannot be blocked or deleted by API or UI.
SD-19 — Reset a user's password as administrator
Priority: P0 — Required
Labels: [ASSIGNMENT], [VARIANT 2], admin, authentication
Depends on: SD-08, SD-11, SD-18
Implementation checklist

Add admin-only POST /api/admin/users/:id/reset-password endpoint.
Generate new variant-2 temporary password exactly as during account creation.
Expire it 12 hours after reset; mark initial-change required.
Revoke existing sessions immediately.
Show new password once and allow user to copy it.
Preserve historical regular-password hashes.
Avoid recording plaintext in logs, browser persistence, or a recoverable DB column.
Acceptance criteria

Reset works only for admin.
Old password cannot be used after the reset.
Existing user sessions stop working.
New temporary password expires in 12 hours and requires replacement on first login.
SD-20 — Admin security policy configuration
Priority: P0 — Required
Labels: [ASSIGNMENT], [VARIANT 2], admin, security
Depends on: SD-10, SD-07, SD-13
Implementation checklist

Implement read/update security_settings API for admin only.
Display and edit the variant-2 personal-data restriction toggle.
Display and edit default minimum password length while enforcing a floor of 12 for this variant.
Display and edit password maximum age in days, including an explicit disabled state.
Display and edit idle session timeout in minutes.
Validate numeric ranges and all settings on the server.
Ensure new settings affect later authentication/password/session validations.
Define/document how changes affect already open sessions (idle checks use the current setting on subsequent requests).
Acceptance criteria

Admin can save settings and see the persisted values after restart.
Non-admin update attempt returns 403.
Switching variant rule on/off demonstrably changes password validation.
Reducing idle timeout changes enforcement of session expiration.
Neither the UI nor API allows weakening the minimum below the variant default of 12.
EPIC 5 — Angular user experience
SD-21 — Build login page
Priority: P0 — Required
Labels: [ASSIGNMENT], frontend, authentication
Depends on: SD-06
Implementation checklist

Create login input and type="password" input.
Use reactive forms and accessible labels.
Submit via typed Angular API service.
Show loading state and prevent duplicate submission.
Display exact generic failure message for wrong credentials.
Navigate according to mustChangePassword/auth stage and user role.
Never persist passwords in storage or URL parameters.
Acceptance criteria

Password is masked in the UI.
Invalid credentials show “Login lub hasło niepoprawne”.
Successful login redirects correctly.
Keyboard-only users can submit the form and view errors.
SD-22 — Build initial password-change page
Priority: P0 — Required
Labels: [ASSIGNMENT], frontend, authentication
Depends on: SD-09
Implementation checklist

Create /change-initial-password route.
Add new password and confirmation inputs.
Explain the temporary credential must be replaced.
Show password-policy guidance based on current settings.
Prevent navigating to normal protected pages until change succeeds.
Handle mismatch, expired temporary credential, server validation errors, and session expiry.
Acceptance criteria

Initial change page always appears when a temporary login succeeds.
Mismatching inputs cannot complete the workflow.
After success, full role-specific application access is available.
API blocks attempts to skip the page.
SD-23 — Build ordinary password-change page
Priority: P0 — Required
Labels: [ASSIGNMENT], frontend, authentication
Depends on: SD-11
Implementation checklist

Add current password, new password, and confirm new password fields.
Show baseline and optional policy rules clearly.
Perform convenience validation in Angular without relying on it for security.
Submit to protected password-change endpoint.
Clear sensitive form state after success or cancellation.
Handle revoked-session result by redirecting to login when appropriate.
Acceptance criteria

Wrong old password cannot change the account password.
Mismatched or historical passwords are rejected.
A compliant new password succeeds and old credentials stop working.
SD-24 — Build administrator UI
Priority: P0 — Required
Labels: [ASSIGNMENT], frontend, admin
Depends on: SD-16, SD-17, SD-18, SD-19, SD-20
Implementation checklist

Create admin dashboard navigation.
Add user list and user detail/edit forms.
Add create, block/unblock, delete, and reset-password actions.
Require confirmation for destructive operations.
Add one-time temporary-password reveal modal without persistent storage.
Add password policy and session settings form.
Show clear success/error states without revealing backend internals.
Acceptance criteria

Admin can perform every operation required by the PDF through the UI.
Protected ADMIN invariants are clear and cannot be bypassed via direct API calls.
Temporary passwords are displayed exactly once in the relevant workflow.
Non-admin user cannot access admin functions.
SD-25 — Build role-specific dashboard and minimal ticket views
Priority: P0 for role-aware dashboard; P1 for ticket demonstrator
Labels: [VARIANT 2], [DESIGN], frontend, authorization
Depends on: SD-15, SD-14 (ticket portion only)
Implementation checklist

Create common authenticated layout with role label and logout action.
Create role-specific welcome/dashboard screens.
Show only navigation matching the role-permission matrix.
Create minimal ticket list/detail/creation views after SD-14 is implemented.
Ensure ownership errors and 403/404 states are understandable.
Keep UI deliberately small; no attachments, rich editors, or external integrations.
Acceptance criteria

All four roles have distinguishable, working screens.
Protected actions are visible only to allowed roles.
Backend rejects unauthorized operations even when UI guards are bypassed.
Ticket demonstrator, if included, shows role differences meaningfully.
SD-26 — Handle session expiry and logout UX
Priority: P0 — Required
Labels: [ASSIGNMENT], frontend, sessions
Depends on: SD-07, SD-20
Implementation checklist

Implement manual Logout button.
Integrate auth HTTP interceptor/service handling 401.
On idle expiry, clear in-memory auth state and redirect to login.
Display a neutral message such as “Your session has expired due to inactivity.”
Ensure open tabs converge to logged-out state after server rejection; browser-tab coordination is optional UX hardening.
Do not implement timeout security solely with frontend timers.
Acceptance criteria

Manual logout immediately invalidates the server session.
After configured inactivity, API rejects old session and UI returns to login.
A manually reused old cookie is ineffective after logout.
No sensitive protected content is fetched without a new successful login.
EPIC 6 — Security verification, tests, and submission
SD-27 — Implement protective controls around the API
Priority: P0 for safe session endpoints / CSRF; P1 for additional abuse resistance
Labels: [HARDENING], security, backend
Depends on: SD-06, SD-07, SD-13
Implementation checklist

Add login request throttling based on appropriate account/IP signals without leaking account existence.
Choose a practical local strategy for a single persistent Node.js process; document scaling limitations.
Protect state-changing cookie-authenticated routes against CSRF.
Add security headers and explicit cache policy for sensitive content.
Use strict request validation and body-size bounds.
Ensure CORS and cookies are consistent with the single-origin deployment plan.
Verify consistent handling of invalid session cookie, forged CSRF attempt, and excessive login attempts.
Ensure SQL access is parameterized and UI text rendering does not bypass Angular escaping.
Acceptance criteria

An unauthorized cross-site state-changing request is rejected.
Repeated login attempts are limited without username enumeration.
Invalid/malformed request data does not cause a raw stack trace response.
Authenticated sensitive responses are not unintentionally cached publicly.
SD-28 — Write unit tests for password and credential policy
Priority: P0 — Verification of required logic
Labels: [ASSIGNMENT], [VARIANT 2], testing
Depends on: SD-05, SD-08, SD-10, SD-11
Implementation checklist

Test Argon2id hashing/verification behavior.
Test 11-, 12-, and longer-character password boundaries.
Test toggle on and off.
Test login substring, first-name substring, last-name substring, and mixed capitalization.
Test empty/invalid user profile values and Unicode behavior according to documented rules.
Test temporary generator output length and character categories over many generated samples.
Test temporary validity at issuedAt + 12h - epsilon and issuedAt + 12h.
Test password history rejection and pruning.
Use fake/injected time rather than sleeping in tests.
Acceptance criteria

All boundary cases above are reproducible and pass in CI/local scripts.
Regression tests fail when a required variant-2 rule is intentionally broken.
Tests do not expose real user credentials.
SD-29 — Write integration tests for auth, sessions, admin actions, and RBAC
Priority: P0 — Verification of required behavior
Labels: [ASSIGNMENT], testing, backend
Depends on: SD-06–SD-20
Implementation checklist

Test login success and indistinguishable invalid-login failure messages.
Test initial-change session limitations.
Test expired temporary credential behavior.
Test normal password change with correct/wrong old password and history.
Test manual logout and reuse of revoked cookie.
Test idle expiry using test-controlled clock.
Test account block/delete/reset and session revocation.
Test admin-only routes across all roles (401 vs 403).
Test updating settings and observing the new policy.
Test ticket object access if SD-14 is implemented.
Test simultaneous/concurrent reset/change operations for consistent account state.
Acceptance criteria

Every mandatory API security rule has at least one positive and one negative test.
A Guest calling an admin route receives 403.
Unauthenticated access receives 401.
Revoked/expired sessions never regain access through an unchanged cookie.
SD-30 — Run browser end-to-end tests and capture evidence
Priority: P0 — Required deliverable evidence
Labels: [ASSIGNMENT], testing, report
Depends on: SD-21–SD-29
Implementation checklist

Set up Playwright and isolated local test database/seed.
Test login as a regular user with a temporary password.
Test mandatory initial change and dashboard access after completion.
Test admin creation, blocking, and reset flows.
Test a 403 forbidden API response with browser dev tools or repeatable API evidence.
Test idle timeout via shorter admin-configured threshold or controlled test clock.
Capture screenshots explicitly requested by the PDF.
Remove/obscure actual plaintext secrets and session cookies before adding screenshots to report/repository.
Preserve a clear scenario name for each screenshot in docs/report-evidence/.
Acceptance criteria

Report screenshots show the requested feature/state rather than only a static mockup.
Evidence includes failed login, initial password change, hash in DB, admin panel, temporary password, 403, and idle logout.
Screenshots and test data contain no reusable secrets.
SD-31 — Complete developer documentation and final PDF report
Priority: P0 — Required submission
Labels: [ASSIGNMENT], documentation, report
Depends on: All P0 features, SD-30
Implementation checklist

Update README with setup, migrations, seed, test commands, and selected architecture.
Record selected hashing algorithm, Argon2id parameters, and reasons for using an established library.
Create and include database ER diagram.
Include variant No. 2 and its exact values.
Include role-permission matrix with ownership explanation.
Include relevant code excerpts without including credentials.
Write theory sections in original wording.
Answer all four PDF control questions.
Add screenshots from SD-30 and explain their significance.
Describe intentional differences between course requirements and the optional project choices.
Describe tested security limitations / further work honestly.
Export the completed report to PDF.
Provide repository URL or code archive, as requested.
Acceptance criteria

All report components from source PDF section 6 are present.
All four control questions from section 5 are answered.
The report contains variant-2 requirements and the self-designed permission matrix.
A reviewer can reproduce the demo using README instructions.
SD-32 — Optional TOTP second-factor authentication
Priority: P2 — Extra credit
Labels: [ASSIGNMENT], [OPTIONAL], authentication, security
Depends on: SD-06, SD-07, SD-09, SD-11
Implementation checklist

Use a maintained TOTP implementation library instead of writing the algorithm manually.
Add protected enrollment flow with a standard authenticator app.
Protect enrollment secret at rest and avoid logging/echoing it after enrollment.
Verify an enrollment code before enabling MFA.
Add second-factor challenge after correct password, before a fully authenticated session is granted.
Reject expired/incorrect codes and rate-limit attempts.
Define secure recovery/disabling procedure requiring an appropriate proof of identity.
Add positive and negative integration tests, and document the feature in the report.
Acceptance criteria

Enabled users cannot obtain a full session with a password alone.
Valid current TOTP code succeeds; wrong/expired code fails.
Enrollment secret is not exposed in routine logs or API responses.
TOTP remains optional and does not block completion of the core module.
9. Security acceptance test matrix
These tests are particularly important because the course evaluates cybersecurity mechanisms, not only whether screens look correct.

ID	Scenario	Expected outcome	Evidence
SEC-01	Login with non-existent login	Generic Polish invalid-credentials message	UI screenshot + API test
SEC-02	Login with real login but wrong password	Same visible error as SEC-01	UI/API test
SEC-03	Query DB users table	Only salted Argon2id hashes, no plaintext	DB screenshot
SEC-04	First login with temporary credentials	Redirect to forced password change	UI screenshot
SEC-05	Try /api/admin/users during restricted first-login stage	Denied	API test
SEC-06	Temporary password 11h59m after issue	Still valid	Clock-controlled test
SEC-07	Temporary password exactly 12h after issue	Expired	Clock-controlled test
SEC-08	Generate 1000 temporary passwords	Every value exactly 16 characters with letters/digits/specials	Automated test
SEC-09	Set new regular password with 11 characters	Rejected	Unit test
SEC-10	Set valid 12-character password	Accepted by length rule (subject to other checks)	Unit test
SEC-11	Personal-data rule enabled; include case-varied first name	Rejected	UI/API test
SEC-12	Personal-data rule disabled; include first name	Not rejected by that rule	Unit test
SEC-13	Normal password change with incorrect old password	Rejected; DB unchanged	API test
SEC-14	Reuse one of last five passwords	Rejected	API test
SEC-15	Guest accesses admin endpoint	HTTP 403	Network screenshot
SEC-16	Anonymous client accesses protected endpoint	HTTP 401	API test
SEC-17	Employee guesses another employee's private ticket ID	No access	API test
SEC-18	Block logged-in user	Their session is revoked	API test
SEC-19	Delete logged-in user	Their session is revoked	API test
SEC-20	Reset a logged-in user's password	Previous session/credentials invalid	API test
SEC-21	Manual logout	Old cookie is invalid	API test
SEC-22	Let session exceed inactivity threshold	Backend denies old cookie	UI screenshot + API test
SEC-23	Change idle timeout through admin panel	New policy enforced by backend	UI/API test
SEC-24	Cross-site state-changing request without valid CSRF protection	Rejected	Security test
SEC-25	SQL injection-like login input	No unauthorized login or SQL execution	API test
SEC-26	HTML/script-looking ticket content	Rendered safely as text, not executed	Browser test
SEC-27	Too many login attempts	Requests are throttled without confirming account existence	API test
SEC-28	Direct PATCH tries to change hidden privileged user fields	Rejected/ignored; no privilege escalation	API test
SEC-29	Try to block/delete/downgrade ADMIN via direct request	Rejected	API test
SEC-30	Restart backend	Unexpired, unrevoked server sessions behave consistently	Integration test
Testing caution: tests must run in a controlled local environment against test accounts/data. Do not perform intrusive testing against third-party services or production systems.

10. Recommended implementation order and dependencies
The development should proceed in vertical slices (database + API + UI + tests for a working workflow), not as one long frontend phase followed by backend work.

Milestone M1 — Repository and reproducible database
Tasks: SD-01, SD-02, SD-03, SD-05, SD-08, SD-04
Outcome: apps run locally, migrations work, seeded users exist, password hashes/temporary passwords are implemented correctly.

Milestone M2 — First complete authentication flow
Tasks: SD-07, SD-06, SD-10, SD-11, SD-09, SD-21, SD-22, SD-23
Outcome: a test user logs in, must change their password, reaches their account, can change it again, and can log out. Add appropriate unit tests in SD-28 as you go.

Milestone M3 — Authorization and role-specific UI
Tasks: SD-12, SD-13, SD-15, role portion of SD-25; optionally SD-14 + ticket portion of SD-25.
Outcome: four roles exist, privileges are enforced on the server, and a Guest receives 403 on an admin API request.

Milestone M4 — Administrator management
Tasks: SD-16, SD-17, SD-18, SD-19, SD-20, SD-24
Outcome: admin can manage users, issue/reset temporary passwords, block/delete accounts, and configure password/session settings.

Milestone M5 — Inactivity, hardening, and verification
Tasks: SD-26, SD-27, SD-28, SD-29, SD-30
Outcome: defensible session/CSRF behavior, security tests, and report evidence are complete.

Milestone M6 — Submission
Tasks: SD-31; SD-32 only if pursuing the extra-credit feature.
Outcome: the final PDF report and a reproducible repository/source archive are ready.

Dependency overview
SD-01 -> SD-02 -> SD-03 -> SD-04 (after SD-05 & SD-08)
                  |        
                  +-> SD-07 -> SD-06 -> SD-09 -> SD-21/SD-22
                  |                   ^
                  +-> SD-10 -> SD-11--+
                  +-> SD-12 -> SD-13 -> SD-15
                  |                    +-> SD-16..SD-20 -> SD-24
                  |                    +-> SD-14 (recommended ticket demo)
                  +-> SD-08 -> SD-17/SD-19
All required features -> SD-26/SD-27/SD-28/SD-29/SD-30 -> SD-31
Optional after core -> SD-32
11. UI and user journeys
11.1 Page inventory
Frontend route	Description	Allowed stage/role
/login	Login form	Anonymous
/change-initial-password	First-login forced change	Restricted session
/dashboard	Role-aware landing screen	Fully authenticated user
/account/change-password	Change own password	Fully authenticated user or restricted PASSWORD_EXPIRED session
/admin/users	User table	Administrator
/admin/users/new	New user creation	Administrator
/admin/users/:id	Edit/block/delete/reset actions	Administrator
/admin/security	Security policy and session settings	Administrator
/tickets	Minimal ticket list	Manager/Employee/Guest, if SD-14 is included
/tickets/new	Create ticket	Manager/Employee/Guest, if SD-14 is included
/tickets/:id	Protected ticket detail	Authorized owner/assignee/manager, if SD-14 is included
/forbidden	Friendly unauthorized page	Any relevant denied flow
11.2 Critical journey: new Employee account
Admin signs in as ADMIN after completing the admin's own initial change.
Admin opens Users and creates a new Employee.
Server generates a 16-character letter/digit/special-character temporary password and stores only its Argon2id hash.
UI displays the temporary password once and explains it expires after 12 hours.
Employee signs in with their login and temporary password.
Employee receives a restricted session and sees the initial change screen.
Employee enters the new password twice; backend validates the current variant-2 policy.
On success, employee gets a fresh/full session and reaches their dashboard.
Employee can access employee-scoped resources but cannot access the admin API.
After inactivity beyond the admin-configured threshold, the backend invalidates the session.
11.3 Critical journey: admin reset of a blocked or active account
Admin opens a user's record.
Admin selects Reset Password and confirms.
Backend revokes the user's existing sessions, replaces credentials with a temporary hash, and sets a new 12-hour expiry.
UI reveals the temporary password once.
User's previous password and old cookies cannot authenticate.
If the account is blocked, it remains blocked until an explicit unblock action; resetting the password does not silently undo blocking.
Once unblocked, user can log in with the non-expired temporary password and must set a new regular password.
11.4 Critical journey: denied operation
Guest signs in successfully.
Guest cannot see user administration in Angular.
Guest manually sends GET /api/admin/users with a valid session cookie.
Backend authenticates the Guest, finds missing permission, and returns 403.
Server does not serialize or leak user-list information.
Screenshot of this request/response is included in the final report.
12. Security threat model (small but explicit)
Threat	Relevant risk	Planned control	Test reference
Password database disclosure	Offline password guessing	Salted Argon2id, tunable cost	SEC-03
User enumeration	Attacker learns whether accounts exist	Uniform invalid-login message and careful timing/limit behavior	SEC-01, SEC-02
Brute-force attempts	Repeated guessing	Rate limiting, safe errors	SEC-27
Temporary credential reuse	Credential works too long or after use	12-hour expiry, forced replacement, server state	SEC-06, SEC-07
Stolen browser session	Session replay	HttpOnly, Secure, server-side token digest, expiry, revocation	SEC-21, SEC-22
CSRF	Attacker triggers privileged write from victim browser	Same-origin checks and documented CSRF defense	SEC-24
Broken access control	Guest accesses admin API	Server-enforced RBAC	SEC-15
Insecure direct object reference	Employee/guest reads another user's resource	Ownership/assignment checks	SEC-17
Privilege escalation through update payload	User sets their own role	Strict field allowlist and backend permissions	SEC-28
SQL injection	Malicious input changes SQL logic	Parameterized ORM queries	SEC-25
XSS	Untrusted business text executes in browser	Angular escaping; no unsafe HTML rendering	SEC-26
Credential leakage in logs	Password/token exposure in files or console	Log redaction and restricted error formats	Review + tests
Stale permissions after account changes	Blocked user retains access	Check account state and revoke sessions	SEC-18, SEC-19
This model is for a student application, not a claim of production security certification.

13. Definition of Done (DoD)
A backlog item may be marked complete only when:

The relevant feature is implemented according to its acceptance criteria.
Frontend functionality cannot bypass backend authorization rules.
Data submitted to API is validated server-side.
Relevant passwords, sessions, and sensitive data are not logged or exposed.
Required automated tests exist and pass (positive and negative security cases).
New routes or permission codes are documented.
Schema changes have a migration and do not silently reset existing data.
User-visible failures are handled consistently and do not leak internals.
The feature is testable in a fresh environment from README instructions.
Screenshot/report evidence has been captured where the PDF requires it.
13.1 Definition of Done for the entire Module 1
All conditions below must hold:

ADMIN exists as a protected, permanent account.
Six test user accounts exist, and all four variant-2 roles are implemented.
Login uses masked password fields, generic invalid-credentials text, and salted Argon2id hashes.
New/reset users receive exactly 16-character administrator-issued temporary passwords valid for exactly 12 hours.
First-login forced password change requires confirmation and is enforced by the backend.
Regular password changes require the old password and reject previous-password reuse.
Default regular password minimum is 12 characters.
Admin can toggle the case-insensitive login/first-name/last-name password exclusion rule.
Admin can list, add, edit, block, and delete user accounts and reset passwords.
Admin can configure regular-password validity in days and session inactivity in minutes.
Backend enforces role permissions, including a reproducible forbidden request returning HTTP 403.
Manual logout and backend-enforced inactivity expiration work.
Required screenshots, database schema, matrix, theoretical responses, and conclusions are in the report.
A repository URL or source archive is supplied.
Strongly recommended but not a course-mandated business feature: the small ticket demonstrator and object-level authorization tests. Optional extra credit: TOTP.

14. Reporting checklist mapped to the PDF
PDF requirement	Deliverable location	Evidence expected
Theoretical introduction	Final PDF §1	Identification vs authentication vs authorization; password hashing, salts, sessions, RBAC
Technology and hashing justification	Final PDF §2	Angular, Next.js, SQLite, Drizzle, Argon2id and reasons
Variant identification	Final PDF §2	Variant No. 2, 12 chars, optional personal-data rule, 6 test users, four roles, 16 chars / 12h
Database schema	Final PDF §2	ER diagram/tables and important fields
Permissions matrix	Final PDF §2	Matrix from section 5 of this backlog and least-privilege reasoning
Key code excerpts	Final PDF §2	Hashing, password validation, temporary credential generation, session guard, RBAC guard
Failed login screenshot	Final PDF §3	Exact generic error text
Forced password change screenshot	Final PDF §3	Two new-password fields
Hash in DB screenshot	Final PDF §3	Encoded Argon2id value, not plaintext
Admin panel screenshot	Final PDF §3	Users and security settings
Temporary password screenshot	Final PDF §3	Format/one-time reveal; mask/redact actual active secret
HTTP 403 screenshot	Final PDF §3	Valid non-admin session denied to admin API
Idle logout screenshot	Final PDF §3	Automatic logout after inactivity
Four control questions	Final PDF §4	All answers from source section 5
Conclusions	Final PDF §5	Achievements, limitations, future extensions
Source repository/archive	Report appendix or submission	Link or attached archive
Notes for control-question answers
Question 1: Discuss why vetted cryptographic/session libraries are safer; examples of mistakes: predictable randomness and improper password handling/comparisons (with context).
Question 2: Distinguish intentionally expensive, salted Argon2id from fast SHA-256 for passwords; explain per-password salts and resistance to precomputation.
Question 3: Explain why mandatory complexity/periodic rotations may encourage weak predictable patterns; also clarify that variant-2/course constraints still must be implemented despite modern guidance.
Question 4: Explain that hiding an Angular button does not block crafted HTTP requests; backend authorization is mandatory.
15. Decisions, assumptions, and open points
This section prevents silently treating project preferences as assignment requirements.

Topic	Proposed decision	Status / reason
Application business domain	SecureDesk internal helpdesk	[DESIGN] — chosen to demonstrate RBAC
Frontend/backend separation	Angular SPA + Next.js API-only	[DESIGN] — matches requested stack
Persistence	SQLite + Drizzle	[DESIGN] — lightweight, portable
Password hashing	Argon2id	[ASSIGNMENT] requires a salted slow password hash; Argon2id is implementation choice
Test accounts	6 non-admin accounts + ADMIN	[DESIGN] — unambiguously satisfies variant count
Role cardinality	One role per user	[DESIGN] — adequate for variant 2
Password history depth	Last 5 regular passwords	[DESIGN] — PDF gives no exact depth
Session idle timeout default	15 minutes	[DESIGN] — PDF requires configurability, not a default
Password maximum age default	Disabled; admin can set days	[DESIGN] — PDF requires configurable validity
Extra variant policy default	Disabled until admin enables it	[DESIGN] — PDF says rule is enabled by admin
Temporary password lifetime	12 hours	[VARIANT 2] — fixed
Temporary password length/format	16 chars, letters+digits+specials	[VARIANT 2] — fixed
ADMIN self-management	Cannot be deleted/blocked/downgraded	[DESIGN] — protects permanent account requirement
User deletion	Soft-delete	[DESIGN] — preserves referential integrity
Permission examples	Helpdesk ticket operations	[DESIGN] — assignment asks for a student-designed matrix
Object-level ticket demonstrator	Recommended, small	[DESIGN] — supports meaningful authorization evidence
TOTP	Optional P2	[ASSIGNMENT] — extra-credit item
CAPTCHA	Future possibility, not implemented now	PDF mentions browser CAPTCHA in later modules without giving their exact requirements
NIST and password length	Course default stays 12; document any difference from external recommendations	Assignment variant takes priority for grading; don't claim that every requirement equals a universal security best practice
15.1 Explicitly unresolved until future materials arrive
Exact functional requirements for Modules 2 and 3.
Whether the lecturer expects the six test users to include ADMIN; the project intentionally uses six regular test accounts plus admin.
Required size of password history (five is a documented design choice).
Whether a particular password-expiration default or range is expected (none is specified in the PDF).
Any prescribed user interface appearance, deployment platform, or CI provider (not specified).
These uncertainties do not block Module 1 because the backlog defines implementable defaults while preserving the assignment's required behavior.

16. Recommended final verification sequence
Start with a clean DB; run migrations and seed.
Confirm exactly four required roles, six non-admin test accounts, and protected ADMIN.
Inspect a password hash and verify no plaintext storage.
Attempt bad credentials; capture required generic message.
Login with valid temporary credentials; confirm forced initial change and backend route restrictions.
Set a valid regular password; verify old temporary password no longer works.
Toggle variant-2 personal-data restriction, test mixed-case login/name/surname rejection, then disable and retest.
Attempt change to a previous password; verify rejection.
Create, edit, block, unblock, reset, and delete a user from admin panel; verify session invalidation.
Verify Manager/Employee/Guest access differences and capture an unauthorized admin API 403.
If the ticket demo exists, verify ownership and assignee rules by changing resource IDs manually.
Adjust idle timeout; verify server rejects expired session; capture UI evidence.
Execute full unit/integration/E2E suite and review sensitive logging.
Fill the report checklist and export the final PDF.
Validate that a clean clone can be started from the committed repository without hidden local dependencies.
17. Source-of-truth and reference materials
Primary source provided for this assignment:

Moduł 1 - Identyfikacja, uwierzytelnianie i autoryzacja.pdf (5 pages).
Page 1: project character, core theory, functional requirements, optional TOTP.
Page 2: individual variant 2 in the variant table.
Page 4: requirement to design the permission matrix; control questions; report structure.
Page 5: required screenshots, report conclusion, repository/archive, reference materials.
Standards and guidance named in the source PDF:

NIST SP 800-63B-4.
OWASP Password Storage Cheat Sheet.
OWASP Authentication Cheat Sheet.
OWASP Authorization Cheat Sheet.
Those are supporting background references. This backlog distinguishes mandatory PDF requirements from suggested engineering choices rather than silently substituting external recommendations for variant 2.

Primary completion target: deliver a small, working, security-focused application whose identity system is complete, whose sensitive operations are protected on the server, whose behavior is backed by repeatable tests, and whose documentation fully satisfies Module 1 / variant 2. Keep business functionality minimal until later module instructions are provided.



⋮⋮⋮⋮⋮⋮⋮⋮