# Permissions

SecureDesk uses role-based access control (variant 2) with four roles. **The code is the source of
truth**; this document reproduces it for the report.

| What                    | Where (under `apps/backend/src/server/`)                             |
| ----------------------- | -------------------------------------------------------------------- |
| The 16 permission codes | `permissions/codes.ts`                                               |
| Who holds which code    | `permissions/matrix.ts` (`ROLE_PERMISSIONS`), reviewed like any code |
| Loading it into the DB  | `db/seeds/rbac.ts` (`seedRbac`)                                      |
| Route-level check       | `http/route-handler.ts` (`defineRoute`), `permissions/authorize.ts`  |
| Object-level check      | `tickets/policy.ts`                                                  |

A test (`permissions/permissions-doc.test.ts`) fails if the per-code table below disagrees with
`ROLE_PERMISSIONS`, so this page cannot silently go stale.

## Roles

| Role          | Polish name   | `roles.id`      | In short                                              |
| ------------- | ------------- | --------------- | ----------------------------------------------------- |
| Administrator | Administrator | `administrator` | Manages accounts and global security settings.        |
| Manager       | Kierownik     | `manager`       | Runs the tickets: sees all, assigns, sets any status. |
| Employee      | Pracownik     | `employee`      | Files tickets and works on those assigned to them.    |
| Guest         | Gość          | `guest`         | Files tickets and sees only their own.                |

## The matrix

The self-designed role and permission matrix of the project (backlog section 5), following the
principle of least privilege:

| Action                                   | Administrator | Manager | Employee | Guest |
| ---------------------------------------- | ------------- | ------- | -------- | ----- |
| List/read user accounts                  | Yes           | No      | No       | No    |
| Create/edit/block/delete user accounts   | Yes           | No      | No       | No    |
| Reset another user's password            | Yes           | No      | No       | No    |
| Reset another user's TOTP after ID check | Yes           | No      | No       | No    |
| Read/change global security settings     | Yes           | No      | No       | No    |
| Change own regular password              | Yes           | Yes     | Yes      | Yes   |
| Create a ticket                          | No            | Yes     | Yes      | Yes   |
| Read all tickets                         | No            | Yes     | No       | No    |
| Read tickets assigned to self            | No            | Yes     | Yes      | No    |
| Read tickets created by self             | No            | Yes     | Yes      | Yes   |
| Assign a ticket to an employee           | No            | Yes     | No       | No    |
| Update status of any ticket              | No            | Yes     | No       | No    |
| Update status of an assigned ticket      | No            | Yes     | Yes      | No    |

**Changing one's own password is not a permission code.** Every signed-in user may do it, and only
for their own account (`POST /api/auth/change-password`, which also asks for the current password),
so there is nothing to grant or withhold.

### The codes behind it, and their object conditions

Each action above is one or more stable codes. A code says an action is allowed _in principle_; for
the codes marked "only", the object condition then decides **per ticket**. A broad role never
replaces the ownership check.

| Code                             | Administrator | Manager | Employee | Guest | Object condition                        |
| -------------------------------- | ------------- | ------- | -------- | ----- | --------------------------------------- |
| `users:read`                     | Yes           | No      | No       | No    | none                                    |
| `users:create`                   | Yes           | No      | No       | No    | none                                    |
| `users:update`                   | Yes           | No      | No       | No    | none                                    |
| `users:block`                    | Yes           | No      | No       | No    | none                                    |
| `users:delete`                   | Yes           | No      | No       | No    | none                                    |
| `users:reset-password`           | Yes           | No      | No       | No    | none                                    |
| `users:reset-totp`               | Yes           | No      | No       | No    | out-of-band identity check required     |
| `security-settings:read`         | Yes           | No      | No       | No    | none                                    |
| `security-settings:update`       | Yes           | No      | No       | No    | none                                    |
| `tickets:create`                 | No            | Yes     | Yes      | Yes   | none: the creator is always the caller  |
| `tickets:read:all`               | No            | Yes     | No       | No    | every ticket                            |
| `tickets:read:assigned`          | No            | Yes     | Yes      | No    | only tickets assigned to the caller     |
| `tickets:read:own`               | No            | Yes     | Yes      | Yes   | only tickets created by the caller      |
| `tickets:assign`                 | No            | Yes     | No       | No    | the assignee must be an active Employee |
| `tickets:status:update:all`      | No            | Yes     | No       | No    | any ticket the caller can read          |
| `tickets:status:update:assigned` | No            | Yes     | Yes      | No    | only tickets assigned to the caller     |

A role that holds both `read:assigned` and `read:own` (Manager, Employee) reads tickets that are
created by **or** assigned to it. Permission input, if it is ever accepted, is validated with a Zod
enum built from `PERMISSIONS`, never a hand-typed list, so a code cannot exist in one place only.

## Why this is least privilege

- **Administrator: identities and security settings, no tickets.** Administering accounts is not a
  reason to read the contents of other people's tickets. With no `tickets:*` code, a stolen or
  misused administrator session reveals no business data, and every ticket endpoint answers `403`.
  This is a deliberate decision and can be reconsidered if later requirements say otherwise.
- **Manager: all ticket work, no user management.** Separation of duties: the person who assigns
  work cannot create accounts, block people or weaken the password rules.
- **Employee: works their own queue.** Files tickets, reads those they created or that were
  assigned to them, and changes the status only of the latter. They cannot assign (so they cannot
  hand themselves, or each other, work) and cannot see a colleague's ticket.
- **Guest: the minimum.** Files a ticket and reads their own. No other person's data, no status
  changes, nothing about staff.

## How a request is decided

1. **`defineRoute`** (every API route): valid session → allowed auth stage → the role holds _any
   of_ the route's permission codes. The permissions are read from the database on every request,
   so removing one from a role applies to the next request without a new login; a code that is not
   in `PERMISSIONS` is never granted. Refusals: `401` or `403`.
2. **The policy** (`tickets/policy.ts`): which _rows_ the permission covers. `ticketListFilter` is
   the SQL `WHERE` of a list, so out-of-scope tickets are never loaded; `canReadTicket`,
   `canUpdateStatus` and `canAssign` check one ticket. They follow the permission codes, not the
   role's name, so `matrix.ts` stays the one place that says who may do what. An actor with no
   ticket permission matches nothing: the policy fails closed.

## Status codes

| Status | `error.code`                    | Meaning                                                                       |
| ------ | ------------------------------- | ----------------------------------------------------------------------------- |
| 401    | `AUTH_REQUIRED`                 | No valid active session. One body for every reason.                           |
| 403    | `AUTH_PASSWORD_CHANGE_REQUIRED` | The session still owes a password change and may call only what allows it.    |
| 403    | `AUTH_FORBIDDEN`                | The role lacks the permission entirely, or the actor may read but not change. |
| 404    | `NOT_FOUND`                     | The object does not exist, **or the caller may not know that it does**.       |
| 400    | `VALIDATION_ERROR`              | Malformed input or a broken field rule.                                       |
| 409    | `CONFLICT`                      | A duplicate or an incompatible state.                                         |

## Object-access policy for tickets

**A ticket the actor may not read answers `404`, byte for byte the same as a ticket that does not
exist** (same status, headers and body; a test compares them). Answering `403` would confirm that
the id exists, and ticket ids could then be enumerated.

`403` is used in exactly two situations:

1. **The role lacks the permission entirely.** The Administrator on every ticket endpoint; a
   Guest or Employee on `assignee`; a Guest on `status`. The answer does not depend on the ticket,
   so it reveals nothing about it, not even for an id that does not exist.
2. **The actor can read the ticket but not change it.** An Employee changing the status of a
   ticket they created but that is not assigned to them. They already know it exists, so refusing
   honestly costs nothing and lets the UI hide the control.

| Endpoint                           | Route-level permission (any of)                   | Then, per ticket                                                         |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET /api/tickets`                 | `tickets:read:all` / `read:assigned` / `read:own` | the list is filtered in SQL; `total` counts only what the caller may see |
| `POST /api/tickets`                | `tickets:create`                                  | creator is the caller, status `OPEN`, nobody assigned                    |
| `GET /api/tickets/[id]`            | `tickets:read:all` / `read:assigned` / `read:own` | `404` unless `canReadTicket`                                             |
| `PATCH /api/tickets/[id]/status`   | `tickets:status:update:all` / `update:assigned`   | `404` unless readable; then `403` unless `canUpdateStatus`               |
| `PATCH /api/tickets/[id]/assignee` | `tickets:assign`                                  | `404` unless readable; `400` unless the assignee is an active Employee   |

The **assignee** must be an Employee who is not blocked and not deleted. A Manager, a Guest, the
Administrator, a blocked or deleted Employee and an id that does not exist all give the same `400`,
so the answer does not reveal which accounts exist or why one does not qualify. Unassigning is not
supported.

**Input.** Request bodies are strict: a field that is not listed (for example `status`,
`createdByUserId` or `assignedToUserId` when creating) is refused with `400`, never ignored, so the
client cannot choose what the server decides. Title: 1-120 characters, description: 1-5000, after
surrounding whitespace is removed.

**Text is plain text.** Title and description are stored exactly as sent (markup included, for
example `<script>alert(1)</script>`) and returned as JSON strings. The API never turns them into
HTML, and the Angular client must show them with text interpolation, never as HTML.

### Who sees the seeded tickets

The demo tickets (`db/seeds/tickets.ts`, development and test databases only) show each way a
ticket can relate to a person:

| Ticket                                               | Manager | employee1 | employee2 | guest1 | guest2 | Administrator |
| ---------------------------------------------------- | ------- | --------- | --------- | ------ | ------ | ------------- |
| guest1's, unassigned                                 | sees    |           |           | sees   |        |               |
| guest2's, assigned to employee1                      | sees    | sees      |           |        | sees   |               |
| employee1's own, unassigned                          | sees    | sees      |           |        |        |               |
| employee2's, assigned to employee2 (once, not twice) | sees    |           | sees      |        |        |               |
| manager1's, assigned to employee1                    | sees    | sees      |           |        |        |               |

Nobody sees "all five" except a Manager, and the Administrator sees none: it gets `403` on every
ticket endpoint.
