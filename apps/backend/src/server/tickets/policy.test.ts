import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedSession } from '../auth/session-service';
import { createMigratedDb, insertUser } from '../db/__fixtures__/test-db';
import type { AppDb } from '../db/connection';
import { tickets } from '../db/schema';
import { PERMISSIONS, ROLES, type RoleId } from '../permissions/codes';
import { ROLE_PERMISSIONS } from '../permissions/matrix';
import {
  READ_TICKETS,
  type TicketActor,
  UPDATE_TICKET_STATUS,
  canAssign,
  canReadTicket,
  canUpdateStatus,
  ticketActor,
  ticketListFilter,
} from './policy';

// Five tickets that between them exercise every way a ticket can relate to a person: created by
// a guest and unassigned, created by a guest and assigned to an employee, created by an
// employee, created by and assigned to the same employee, created by a manager and assigned to
// an employee. The expectations below are written out by hand, role by role, on purpose: they are
// the specification, and a policy that drifts must fail here rather than be re-derived into
// agreement with itself.
let db: AppDb;
const user: Record<string, string> = {};
const ticketIds: Record<string, string> = {};

const SCENARIO = [
  ['guest1Unassigned', 'guest1', null],
  ['guest2ToEmployee1', 'guest2', 'employee1'],
  ['employee1Own', 'employee1', null],
  ['employee2ToSelf', 'employee2', 'employee2'],
  ['manager1ToEmployee1', 'manager1', 'employee1'],
] as const;

beforeAll(() => {
  db = createMigratedDb();
  const roleOf = (login: string): RoleId =>
    login.startsWith('manager')
      ? ROLES.MANAGER
      : login.startsWith('employee')
        ? ROLES.EMPLOYEE
        : login.startsWith('guest')
          ? ROLES.GUEST
          : ROLES.ADMINISTRATOR;

  for (const login of ['ADMIN', 'manager1', 'employee1', 'employee2', 'guest1', 'guest2']) {
    user[login] = insertUser(db, { login, roleId: roleOf(login) });
  }
  for (const [key, creator, assignee] of SCENARIO) {
    const [row] = db
      .insert(tickets)
      .values({
        title: key,
        description: 'scenario',
        createdByUserId: user[creator] as string,
        assignedToUserId: assignee ? (user[assignee] as string) : null,
      })
      .returning({ id: tickets.id })
      .all();
    ticketIds[key] = (row as { id: string }).id;
  }
});
afterAll(() => db.$client.close());

// Built on demand: the user ids exist only after `beforeAll` has inserted the users.
const ACTOR_DEFS = {
  manager1: ['manager1', ROLES.MANAGER],
  employee1: ['employee1', ROLES.EMPLOYEE],
  employee2: ['employee2', ROLES.EMPLOYEE],
  guest1: ['guest1', ROLES.GUEST],
  guest2: ['guest2', ROLES.GUEST],
  administrator: ['ADMIN', ROLES.ADMINISTRATOR],
} as const;

type ActorName = keyof typeof ACTOR_DEFS;

const actor = (name: ActorName): TicketActor => {
  const [login, roleId] = ACTOR_DEFS[name];
  return { id: user[login] as string, permissions: ROLE_PERMISSIONS[roleId] };
};
type TicketKey = (typeof SCENARIO)[number][0];

const idsOf = (...keys: TicketKey[]) => keys.map((key) => ticketIds[key] as string).sort();
const allRows = () => db.select().from(tickets).all();
const listedFor = (actor: TicketActor) =>
  db
    .select({ id: tickets.id })
    .from(tickets)
    .where(ticketListFilter(actor))
    .all()
    .map((row) => row.id)
    .sort();

// What each actor may READ.
const READABLE: [ActorName, TicketKey[]][] = [
  [
    'manager1',
    [
      'guest1Unassigned',
      'guest2ToEmployee1',
      'employee1Own',
      'employee2ToSelf',
      'manager1ToEmployee1',
    ],
  ],
  // Created OR assigned: their own ticket plus the two assigned to them.
  ['employee1', ['guest2ToEmployee1', 'employee1Own', 'manager1ToEmployee1']],
  // Created and assigned are the same person here: still one row, not two.
  ['employee2', ['employee2ToSelf']],
  ['guest1', ['guest1Unassigned']],
  // Assigned to an employee, but still created by guest2, so guest2 keeps seeing it.
  ['guest2', ['guest2ToEmployee1']],
  // The Administrator holds no tickets:* code: least privilege.
  ['administrator', []],
];

describe('ticketListFilter (the SQL condition)', () => {
  it.each(READABLE)('lets %s list exactly the tickets they may read', (name, keys) => {
    expect(listedFor(actor(name))).toEqual(idsOf(...keys));
  });

  it('applies no restriction only to the role that reads all tickets', () => {
    expect(ticketListFilter(actor('manager1'))).toBeUndefined();
    for (const name of ['employee1', 'employee2', 'guest1', 'guest2', 'administrator'] as const) {
      expect(ticketListFilter(actor(name)), name).toBeDefined();
    }
  });

  it('fails closed: a role with no ticket permission matches nothing, never everything', () => {
    expect(listedFor({ id: user.guest1 as string, permissions: [] })).toEqual([]);
  });

  it('ignores a permission code that does not exist', () => {
    const actor = {
      id: user.manager1 as string,
      permissions: ['tickets:read:everything', 'TICKETS:READ:ALL', 'tickets:read:all '],
    };

    expect(listedFor(actor)).toEqual([]);
    expect(allRows()).toHaveLength(5); // the rows are there; the actor just may not see them
  });

  it('follows the permission codes, not the name of the role', () => {
    const assignedOnly = {
      id: user.employee1 as string,
      permissions: [PERMISSIONS.TICKETS_READ_ASSIGNED],
    };
    const ownOnly = { id: user.employee1 as string, permissions: [PERMISSIONS.TICKETS_READ_OWN] };

    expect(listedFor(assignedOnly)).toEqual(idsOf('guest2ToEmployee1', 'manager1ToEmployee1'));
    expect(listedFor(ownOnly)).toEqual(idsOf('employee1Own'));
  });
});

describe('canReadTicket', () => {
  it.each(READABLE)('lets %s read exactly the tickets they may list', (name, keys) => {
    const readable = allRows()
      .filter((ticket) => canReadTicket(actor(name), ticket))
      .map((ticket) => ticket.id)
      .sort();

    expect(readable).toEqual(idsOf(...keys));
  });

  // The list is filtered in SQL and a single ticket is checked in code: two forms of one rule.
  // If they ever disagree, a ticket would be hidden from a list but open by id, or the reverse.
  it.each(Object.keys(ACTOR_DEFS) as ActorName[])(
    'agrees with the SQL filter for %s on every ticket',
    (name) => {
      const byCode = allRows()
        .filter((ticket) => canReadTicket(actor(name), ticket))
        .map((ticket) => ticket.id)
        .sort();

      expect(byCode).toEqual(listedFor(actor(name)));
    },
  );

  it('denies an actor with no permission and one holding only an unknown code', () => {
    const [ticket] = allRows();
    const nothing = { id: user.manager1 as string, permissions: [] };
    const unknown = { id: user.manager1 as string, permissions: ['tickets:read:everything'] };

    expect(canReadTicket(nothing, ticket as never)).toBe(false);
    expect(canReadTicket(unknown, ticket as never)).toBe(false);
  });

  it('does not treat a ticket with no assignee as assigned to an actor with an empty id', () => {
    const actor = { id: '', permissions: [PERMISSIONS.TICKETS_READ_ASSIGNED] };

    expect(canReadTicket(actor, { createdByUserId: 'x', assignedToUserId: null })).toBe(false);
  });
});

describe('canUpdateStatus', () => {
  const UPDATABLE: [ActorName, TicketKey[]][] = [
    [
      'manager1',
      [
        'guest1Unassigned',
        'guest2ToEmployee1',
        'employee1Own',
        'employee2ToSelf',
        'manager1ToEmployee1',
      ],
    ],
    // Assigned to them yes; created by them but never assigned (employee1Own) no.
    ['employee1', ['guest2ToEmployee1', 'manager1ToEmployee1']],
    ['employee2', ['employee2ToSelf']],
    ['guest1', []],
    ['guest2', []],
    ['administrator', []],
  ];

  it.each(UPDATABLE)('lets %s change the status of exactly these tickets', (name, keys) => {
    const updatable = allRows()
      .filter((ticket) => canUpdateStatus(actor(name), ticket))
      .map((ticket) => ticket.id)
      .sort();

    expect(updatable).toEqual(idsOf(...keys));
  });

  it('denies an actor with no permission and one holding only an unknown code', () => {
    const ticket = { createdByUserId: 'x', assignedToUserId: user.employee1 as string };

    expect(canUpdateStatus({ id: user.employee1 as string, permissions: [] }, ticket)).toBe(false);
    expect(
      canUpdateStatus(
        { id: user.employee1 as string, permissions: ['tickets:status:update:everything'] },
        ticket,
      ),
    ).toBe(false);
  });
});

describe('canAssign', () => {
  it.each([
    ['manager1', true],
    ['employee1', false],
    ['guest1', false],
    ['administrator', false],
  ] as const)('answers %s: %s', (name, expected) => {
    expect(canAssign(actor(name))).toBe(expected);
  });
});

describe('the route-level permission lists', () => {
  // A route is open to a role holding ANY of these; the policy then narrows to rows. A read or
  // status code added to PERMISSIONS but forgotten here would leave its holders locked out.
  it('name exactly the read codes and the status-update codes that exist', () => {
    const codes = Object.values(PERMISSIONS);

    expect([...READ_TICKETS].sort()).toEqual(
      codes.filter((code) => code.startsWith('tickets:read:')).sort(),
    );
    expect([...UPDATE_TICKET_STATUS].sort()).toEqual(
      codes.filter((code) => code.startsWith('tickets:status:update:')).sort(),
    );
  });
});

describe('ticketActor', () => {
  it('takes the user id and the permissions, nothing else of the session', () => {
    const session = {
      session: { id: 'session-id' },
      user: { id: 'user-id', login: 'someone', roleId: 'employee' },
      permissions: ['tickets:create'],
    } as unknown as ResolvedSession;

    expect(ticketActor(session)).toEqual({ id: 'user-id', permissions: ['tickets:create'] });
  });
});
