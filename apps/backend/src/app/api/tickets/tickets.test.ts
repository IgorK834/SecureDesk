import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiClient, createApiClient } from '../../../../../../tests/helpers/api-client';
import { FakeClock } from '../../../../../../tests/helpers/fake-clock';
import type { AuthStage } from '../../../server/db/schema';
import { seedWorld, signInAs } from '../../../server/db/__fixtures__/seeded-world';
import { setUpSharedTestDb } from '../../../server/db/__fixtures__/shared-test-db';
import { insertUser } from '../../../server/db/__fixtures__/test-db';
import { db } from '../../../server/db/client';
import { DEMO_TICKETS, seedTickets } from '../../../server/db/seeds/tickets';
import { permissions, rolePermissions, tickets } from '../../../server/db/schema';
import { PERMISSIONS, ROLES } from '../../../server/permissions/codes';
import * as assigneeRoute from './[id]/assignee/route';
import * as ticketRoute from './[id]/route';
import * as statusRoute from './[id]/status/route';
import * as ticketsRoute from './route';

// The ticket API end to end: real route handlers, real sessions and cookies, a real (in-memory)
// database seeded with the demo scenarios. Who may see or change what is the point of this file,
// so the expectations are written out role by role instead of being computed from the policy.

const T0 = new Date('2030-01-01T00:00:00.000Z');
const MINUTE_MS = 60 * 1000;

setUpSharedTestDb();
const fakeClock = new FakeClock(T0);
let ids: Record<string, string>;

beforeEach(() => {
  fakeClock.set(T0);
  fakeClock.install();
  ids = seedWorld(db);
  db.transaction((tx) => seedTickets(tx));
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  fakeClock.uninstall();
  vi.restoreAllMocks();
});

type TicketKey = keyof typeof DEMO_TICKETS;
const A: TicketKey = 'guest1Unassigned';
const B: TicketKey = 'guest2ToEmployee1';
const C: TicketKey = 'employee1Own';
const D: TicketKey = 'employee2ToSelf';
const E: TicketKey = 'manager1ToEmployee1';
const ALL_KEYS: TicketKey[] = [A, B, C, D, E];
const idOf = (key: TicketKey) => DEMO_TICKETS[key].id;
const NO_SUCH_TICKET = '00000000-0000-4000-8000-0000000000ff';

const NOT_SIGNED_IN = '{"error":{"code":"AUTH_REQUIRED","message":"Wymagane zalogowanie"}}';
const FORBIDDEN = '{"error":{"code":"AUTH_FORBIDDEN","message":"Brak uprawnień"}}';
const NOT_FOUND = '{"error":{"code":"NOT_FOUND","message":"Nie znaleziono zasobu"}}';
const PASSWORD_CHANGE = '"code":"AUTH_PASSWORD_CHANGE_REQUIRED"';

const asUser = (login?: string, stage: AuthStage = 'FULLY_AUTHENTICATED'): ApiClient => {
  const client = createApiClient();
  if (login) client.signIn(signInAs(db, ids[login] as string, stage));
  return client;
};

const apiList = (c: ApiClient, query = '') => c.get(ticketsRoute, `/api/tickets${query}`);
const apiCreate = (c: ApiClient, json: unknown) => c.post(ticketsRoute, '/api/tickets', { json });
const apiGet = (c: ApiClient, id: string) =>
  c.get(ticketRoute, `/api/tickets/${id}`, { params: { id } });
const apiSetStatus = (c: ApiClient, id: string, json: unknown) =>
  c.patch(statusRoute, `/api/tickets/${id}/status`, { params: { id }, json });
const apiAssign = (c: ApiClient, id: string, json: unknown) =>
  c.patch(assigneeRoute, `/api/tickets/${id}/assignee`, { params: { id }, json });

const body = async (response: Response) => JSON.parse(await response.text());
const rows = () => db.select().from(tickets).orderBy(tickets.id).all();
const row = (id: string) => db.select().from(tickets).where(eq(tickets.id, id)).get();
/** Everything a client could compare to tell two answers apart. */
const fingerprint = async (response: Response) => ({
  status: response.status,
  headers: [...response.headers],
  body: await response.text(),
});

// What each person may READ, by the seeded scenarios (see seeds/tickets.ts):
//   A guest1 -> nobody          B guest2 -> employee1      C employee1 -> nobody
//   D employee2 -> employee2    E manager1 -> employee1
const READABLE: [login: string, keys: TicketKey[]][] = [
  ['manager1', ALL_KEYS],
  ['manager2', ALL_KEYS], // a Manager sees everything, including tickets they have nothing to do with
  ['employee1', [B, C, E]], // created C; assigned B and E
  ['employee2', [D]], // created and assigned D: once, not twice
  ['guest1', [A]],
  ['guest2', [B]], // assigned to an employee, but still their own
];

describe('GET /api/tickets: each role lists only what it may read', () => {
  it.each(READABLE)('%s', async (login, keys) => {
    const response = await apiList(asUser(login));
    const result = await body(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(result.items.map((item: { id: string }) => item.id).sort()).toEqual(
      keys.map(idOf).sort(),
    );
    expect(result.total).toBe(keys.length);
  });

  it('returns exactly the documented fields of a ticket and nothing else', async () => {
    const { items } = await body(await apiList(asUser('guest1')));

    expect(items).toHaveLength(1);
    expect(Object.keys(items[0]).sort()).toEqual([
      'assignedToUserId',
      'createdAt',
      'createdByUserId',
      'description',
      'id',
      'status',
      'title',
      'updatedAt',
    ]);
    expect(items[0]).toMatchObject({
      id: idOf(A),
      title: DEMO_TICKETS.guest1Unassigned.title,
      status: 'OPEN',
      createdByUserId: ids.guest1,
      assignedToUserId: null,
    });
  });

  it('shows a ticket created by and assigned to the same employee once', async () => {
    const { items, total } = await body(await apiList(asUser('employee2')));

    expect(items).toHaveLength(1);
    expect(total).toBe(1);
  });
});

describe('GET /api/tickets/[id]: every role against every ticket', () => {
  const cases = READABLE.flatMap(([login, readable]) =>
    ALL_KEYS.map((key) => [login, key, readable.includes(key)] as const),
  );

  it.each(cases)('%s asks for %s: readable=%s', async (login, key, readable) => {
    const response = await apiGet(asUser(login), idOf(key));

    if (readable) {
      expect(response.status).toBe(200);
      expect(await body(response)).toMatchObject({ id: idOf(key), title: DEMO_TICKETS[key].title });
    } else {
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(NOT_FOUND);
    }
  });

  // SEC-17: a guest must not be able to tell "not yours" from "does not exist".
  it('SEC-17: answers a ticket the caller may not read exactly like one that does not exist', async () => {
    const guest = asUser('guest1');

    const someoneElses = await fingerprint(await apiGet(guest, idOf(B)));
    const missing = await fingerprint(await apiGet(guest, NO_SUCH_TICKET));

    expect(someoneElses.status).toBe(404);
    expect(someoneElses).toEqual(missing);
  });

  it.each([['guest1'], ['employee1']])(
    'does the same for %s on the status endpoint',
    async (login) => {
      const client = asUser(login);
      // employee1 cannot read A or D; guest1 cannot read B, C, D or E. Use one of each.
      const unreadable = login === 'guest1' ? idOf(B) : idOf(A);

      const status = [
        await fingerprint(await apiSetStatus(client, unreadable, { status: 'RESOLVED' })),
        await fingerprint(await apiSetStatus(client, NO_SUCH_TICKET, { status: 'RESOLVED' })),
      ];

      expect(status[0]).toEqual(status[1]);
    },
  );

  it('refuses a malformed id before looking anything up', async () => {
    const response = await apiGet(asUser('manager1'), 'not-a-uuid');

    expect(response.status).toBe(400);
  });
});

describe('every ticket endpoint: who is turned away before the policy is asked', () => {
  const endpoints: [string, (c: ApiClient) => Promise<Response>][] = [
    ['GET /api/tickets', (c) => apiList(c)],
    ['POST /api/tickets', (c) => apiCreate(c, { title: 'T', description: 'D' })],
    ['GET /api/tickets/[id]', (c) => apiGet(c, idOf(A))],
    ['PATCH /api/tickets/[id]/status', (c) => apiSetStatus(c, idOf(A), { status: 'RESOLVED' })],
    [
      'PATCH /api/tickets/[id]/assignee',
      (c) => apiAssign(c, idOf(A), { assignedToUserId: ids.employee1 }),
    ],
  ];

  it.each(endpoints)(
    '%s answers an anonymous caller with 401 and nothing else',
    async (_, call) => {
      const before = rows();

      const response = await call(asUser());

      expect(response.status).toBe(401);
      expect(await response.text()).toBe(NOT_SIGNED_IN);
      expect(rows()).toEqual(before);
    },
  );

  // The Administrator holds no tickets:* code: administering users is not reading their tickets.
  it.each(endpoints)('%s answers the Administrator with 403 and nothing else', async (_, call) => {
    const before = rows();

    const response = await call(asUser('ADMIN'));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe(FORBIDDEN);
    expect(rows()).toEqual(before);
  });

  it.each(endpoints)(
    '%s answers a session that owes a password change with 403',
    async (_, call) => {
      const before = rows();

      const response = await call(asUser('manager1', 'INITIAL_PASSWORD_CHANGE'));
      const text = await response.text();

      expect(response.status).toBe(403);
      expect(text).toContain(PASSWORD_CHANGE);
      expect(text).not.toContain(DEMO_TICKETS.guest1Unassigned.title);
      expect(rows()).toEqual(before);
    },
  );

  it('applies a permission removed from a role on the very next request', async () => {
    const guest = asUser('guest1');
    expect((await apiList(guest)).status).toBe(200);

    db.delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, ROLES.GUEST),
          eq(rolePermissions.permissionId, PERMISSIONS.TICKETS_READ_OWN),
        ),
      )
      .run();

    const response = await apiList(guest);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe(FORBIDDEN);
    expect(await (await apiGet(guest, idOf(A))).text()).toBe(FORBIDDEN);
  });

  it('keeps the permission rows the policy relies on', () => {
    // If a code were renamed, the seeded roles would silently lose it; fail here instead.
    const codes = db
      .select({ code: permissions.code })
      .from(permissions)
      .all()
      .map(({ code }) => code);

    expect(codes).toEqual(
      expect.arrayContaining([
        PERMISSIONS.TICKETS_CREATE,
        PERMISSIONS.TICKETS_READ_ALL,
        PERMISSIONS.TICKETS_READ_ASSIGNED,
        PERMISSIONS.TICKETS_READ_OWN,
        PERMISSIONS.TICKETS_ASSIGN,
        PERMISSIONS.TICKETS_STATUS_UPDATE_ALL,
        PERMISSIONS.TICKETS_STATUS_UPDATE_ASSIGNED,
      ]),
    );
  });
});

describe('GET /api/tickets: paging', () => {
  const idsOfPage = async (query: string, login = 'manager1') =>
    (await body(await apiList(asUser(login), query))).items.map((item: { id: string }) => item.id);

  it('answers with the page, its limit and offset, and the size of the whole list', async () => {
    const result = await body(await apiList(asUser('manager1'), '?limit=2&offset=1'));

    expect(result).toMatchObject({ limit: 2, offset: 1, total: 5 });
    expect(result.items).toHaveLength(2);
  });

  it('defaults to 20 items from the start', async () => {
    const result = await body(await apiList(asUser('manager1')));

    expect(result).toMatchObject({ limit: 20, offset: 0 });
  });

  it('orders the seeded tickets, which share one timestamp, by id so paging is stable', async () => {
    const pages = [
      ...(await idsOfPage('?limit=2&offset=0')),
      ...(await idsOfPage('?limit=2&offset=2')),
      ...(await idsOfPage('?limit=2&offset=4')),
    ];

    expect(pages).toEqual([E, D, C, B, A].map(idOf)); // each exactly once, in this order
  });

  it('lists the newest ticket first', async () => {
    const manager = asUser('manager1');
    const created: string[] = [];
    for (const title of ['first', 'second', 'third']) {
      fakeClock.advance(MINUTE_MS);
      created.push((await body(await apiCreate(manager, { title, description: 'd' }))).id);
    }

    expect(await idsOfPage('?limit=3')).toEqual([...created].reverse());
  });

  it('counts only what the caller may see, not the whole table', async () => {
    const result = await body(await apiList(asUser('employee1'), '?limit=1'));

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(3); // B, C and E; the other two exist but are not theirs
  });

  // The filter belongs in the query, before LIMIT and OFFSET. Applied to a page afterwards, it
  // leaves short or empty pages in the middle (employee1's tickets are E, C, B, but D sits between
  // E and C in the whole list) and `total` no longer matches what the pages add up to.
  it.each<[login: string, keys: TicketKey[]]>([
    ['employee1', [E, C, B]],
    ['employee2', [D]],
    ['guest2', [B]],
  ])(
    '%s: every page is full and the pages add up to exactly their own tickets',
    async (login, keys) => {
      const pages: string[][] = [];
      for (let offset = 0; offset < keys.length; offset += 2) {
        pages.push(await idsOfPage(`?limit=2&offset=${offset}`, login));
      }

      expect(pages.flat()).toEqual(keys.map(idOf));
      expect(pages.slice(0, -1).every((page) => page.length === 2)).toBe(true);
      expect(await idsOfPage(`?limit=2&offset=${keys.length}`, login)).toEqual([]);
    },
  );

  it('answers a page past the end with no items, not an error', async () => {
    expect(await idsOfPage('?offset=5')).toEqual([]);
    expect(await idsOfPage('?offset=9007199254740991')).toEqual([]);
  });

  it('accepts the largest page, 100', async () => {
    expect((await apiList(asUser('manager1'), '?limit=100')).status).toBe(200);
  });

  it.each([
    '?limit=101',
    '?limit=0',
    '?limit=-1',
    '?limit=abc',
    '?limit=1.5',
    '?offset=-1',
    '?offset=x',
    '?sort=title',
  ])('refuses the query %s', async (query) => {
    const response = await apiList(asUser('manager1'), query);

    expect(response.status).toBe(400);
  });
});

describe('POST /api/tickets', () => {
  it.each(['manager1', 'employee1', 'guest1'])(
    'lets %s file a ticket: they are the creator, it is OPEN and nobody is assigned',
    async (login) => {
      const client = asUser(login);

      const response = await apiCreate(client, { title: 'Nowe zgłoszenie', description: 'Opis' });
      const created = await body(response);

      expect(response.status).toBe(201);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(created).toMatchObject({
        title: 'Nowe zgłoszenie',
        description: 'Opis',
        status: 'OPEN',
        createdByUserId: ids[login],
        assignedToUserId: null,
      });
      expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row(created.id)).toMatchObject({ createdByUserId: ids[login], status: 'OPEN' });
      // The creator can read it back; it shows up in their own list.
      expect((await apiGet(client, created.id)).status).toBe(200);
      expect(
        (await body(await apiList(client))).items.map((item: { id: string }) => item.id),
      ).toContain(created.id);
    },
  );

  it('keeps a new guest ticket from every other guest', async () => {
    const created = await body(await apiCreate(asUser('guest1'), { title: 'T', description: 'D' }));

    const other = await apiGet(asUser('guest2'), created.id);

    expect(other.status).toBe(404);
  });

  it('files nothing for the Administrator', async () => {
    const before = rows();

    const response = await apiCreate(asUser('ADMIN'), { title: 'T', description: 'D' });

    expect(response.status).toBe(403);
    expect(rows()).toEqual(before);
  });

  // The script is data. The API stores it exactly as sent and returns it as a JSON string; it is
  // never turned into HTML here, and the client must not render it as HTML either.
  it('stores <script>alert(1)</script> verbatim and returns it as JSON text', async () => {
    const xss = '<script>alert(1)</script>';
    const guest = asUser('guest1');

    const created = await body(await apiCreate(guest, { title: xss, description: `${xss}&amp;` }));
    const response = await apiGet(guest, created.id);

    expect(row(created.id)).toMatchObject({ title: xss, description: `${xss}&amp;` });
    expect(response.headers.get('content-type')).toMatch(/^application\/json/);
    expect(await body(response)).toMatchObject({ title: xss, description: `${xss}&amp;` });
  });

  it('keeps Polish letters and emoji exactly as sent', async () => {
    const text = 'Zażółć gęślą jaźń 🙂';

    const created = await body(
      await apiCreate(asUser('guest1'), { title: text, description: text }),
    );

    expect(row(created.id)).toMatchObject({ title: text, description: text });
  });

  it('removes whitespace around the text but not inside it', async () => {
    const created = await body(
      await apiCreate(asUser('guest1'), {
        title: '  Dwa  słowa \n',
        description: '\tlinia 1\nlinia 2  ',
      }),
    );

    expect(created).toMatchObject({ title: 'Dwa  słowa', description: 'linia 1\nlinia 2' });
  });

  it('accepts the longest title (120) and description (5000)', async () => {
    const response = await apiCreate(asUser('guest1'), {
      title: 't'.repeat(120),
      description: 'd'.repeat(5000),
    });

    expect(response.status).toBe(201);
  });

  const INVALID: [string, unknown][] = [
    ['an empty title', { title: '', description: 'D' }],
    ['a blank title', { title: '   ', description: 'D' }],
    ['a title of 121 characters', { title: 't'.repeat(121), description: 'D' }],
    ['no title', { description: 'D' }],
    ['a title that is not text', { title: 5, description: 'D' }],
    ['an empty description', { title: 'T', description: '' }],
    ['a blank description', { title: 'T', description: ' \n ' }],
    ['a description of 5001 characters', { title: 'T', description: 'd'.repeat(5001) }],
    ['no description', { title: 'T' }],
    ['a null body', null],
    ['a list instead of an object', []],
    // Mass assignment: the server decides these, whatever the client claims.
    ['a status', { title: 'T', description: 'D', status: 'RESOLVED' }],
    [
      'a creator',
      { title: 'T', description: 'D', createdByUserId: '00000000-0000-4000-8000-000000000001' },
    ],
    [
      'an assignee',
      { title: 'T', description: 'D', assignedToUserId: '00000000-0000-4000-8000-000000000001' },
    ],
    ['an id', { title: 'T', description: 'D', id: '00000000-0000-4000-8000-000000000001' }],
  ];

  it.each(INVALID)('refuses %s and files nothing', async (_, input) => {
    const before = rows();

    const response = await apiCreate(asUser('manager1'), input);

    expect(response.status).toBe(400);
    expect(rows()).toEqual(before);
  });

  it('refuses a body that is not JSON', async () => {
    const before = rows();

    const response = await asUser('guest1').post(ticketsRoute, '/api/tickets', {
      body: 'title=T&description=D',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });

    expect(response.status).toBe(415);
    expect(rows()).toEqual(before);
  });
});

describe('PATCH /api/tickets/[id]/status', () => {
  it('lets a Manager set any status on any ticket, in any direction', async () => {
    const manager = asUser('manager1');

    for (const key of ALL_KEYS) {
      for (const status of ['IN_PROGRESS', 'RESOLVED', 'OPEN'] as const) {
        const response = await apiSetStatus(manager, idOf(key), { status });

        expect(response.status, `${key} -> ${status}`).toBe(200);
        expect(await body(response)).toMatchObject({ id: idOf(key), status });
        expect(row(idOf(key))?.status).toBe(status);
      }
    }
  });

  it('refreshes updated_at and leaves created_at alone', async () => {
    fakeClock.advance(5 * MINUTE_MS);

    await apiSetStatus(asUser('manager1'), idOf(A), { status: 'RESOLVED' });

    expect(row(idOf(A))).toMatchObject({
      createdAt: T0,
      updatedAt: new Date(T0.getTime() + 5 * MINUTE_MS),
    });
  });

  it('lets an Employee change the status of a ticket assigned to them', async () => {
    const employee1 = await apiSetStatus(asUser('employee1'), idOf(B), { status: 'RESOLVED' });
    const employee2 = await apiSetStatus(asUser('employee2'), idOf(D), { status: 'IN_PROGRESS' });

    expect(employee1.status).toBe(200);
    expect(employee2.status).toBe(200);
    expect(row(idOf(B))?.status).toBe('RESOLVED');
    expect(row(idOf(D))?.status).toBe('IN_PROGRESS');
  });

  // The Employee created C, so may read it, but it was never assigned to them: 403, not 404.
  it('refuses an Employee on a ticket they can read but is not assigned to: 403, unchanged', async () => {
    const before = rows();

    const response = await apiSetStatus(asUser('employee1'), idOf(C), { status: 'RESOLVED' });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe(FORBIDDEN);
    expect(rows()).toEqual(before);
  });

  // An unassigned ticket belongs to nobody they may see: 404, indistinguishable from missing.
  it.each([
    ['an unassigned ticket they did not create', 'employee1', A],
    ['another employee’s ticket', 'employee1', D],
    ['a ticket of a colleague', 'employee2', C],
  ] as const)('answers an Employee on %s with 404 and changes nothing', async (_, login, key) => {
    const before = rows();

    const response = await apiSetStatus(asUser(login), idOf(key), { status: 'RESOLVED' });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe(NOT_FOUND);
    expect(rows()).toEqual(before);
  });

  it.each(['guest1', 'guest2'])(
    'answers %s with 403 for any ticket, their own included, and changes nothing',
    async (login) => {
      const before = rows();
      const client = asUser(login);

      for (const key of ALL_KEYS) {
        const response = await apiSetStatus(client, idOf(key), { status: 'RESOLVED' });
        expect(response.status, key).toBe(403);
      }
      // The same answer for an id that does not exist: it reveals nothing about the ticket.
      expect(
        await (await apiSetStatus(client, NO_SUCH_TICKET, { status: 'RESOLVED' })).text(),
      ).toBe(FORBIDDEN);
      expect(rows()).toEqual(before);
    },
  );

  it('answers a Manager on a ticket that does not exist with 404', async () => {
    const response = await apiSetStatus(asUser('manager1'), NO_SUCH_TICKET, { status: 'RESOLVED' });

    expect(response.status).toBe(404);
  });

  it.each([
    ['a status that does not exist', { status: 'CLOSED' }],
    ['a status in lower case', { status: 'resolved' }],
    ['no status', {}],
    ['a status that is not text', { status: 1 }],
    [
      'an extra field',
      { status: 'RESOLVED', assignedToUserId: '00000000-0000-4000-8000-000000000001' },
    ],
  ])('refuses %s and changes nothing', async (_, input) => {
    const before = rows();

    const response = await apiSetStatus(asUser('manager1'), idOf(A), input);

    expect(response.status).toBe(400);
    expect(rows()).toEqual(before);
  });
});

describe('PATCH /api/tickets/[id]/assignee', () => {
  it('lets a Manager assign a ticket to an active Employee, and reassign it', async () => {
    const manager = asUser('manager1');

    const first = await apiAssign(manager, idOf(A), { assignedToUserId: ids.employee1 });
    const second = await apiAssign(manager, idOf(A), { assignedToUserId: ids.employee2 });

    expect(first.status).toBe(200);
    expect(await body(first)).toMatchObject({ id: idOf(A), assignedToUserId: ids.employee1 });
    expect(second.status).toBe(200);
    expect(row(idOf(A))?.assignedToUserId).toBe(ids.employee2);
  });

  it('gives the assignee the ticket: they can read it and change its status afterwards', async () => {
    await apiAssign(asUser('manager1'), idOf(A), { assignedToUserId: ids.employee2 });

    const employee2 = asUser('employee2');
    expect((await apiGet(employee2, idOf(A))).status).toBe(200);
    expect((await apiSetStatus(employee2, idOf(A), { status: 'IN_PROGRESS' })).status).toBe(200);
  });

  it('takes the ticket away from the previous assignee', async () => {
    await apiAssign(asUser('manager1'), idOf(B), { assignedToUserId: ids.employee2 });

    expect((await apiGet(asUser('employee1'), idOf(B))).status).toBe(404);
    expect((await apiGet(asUser('employee2'), idOf(B))).status).toBe(200);
  });

  // Every way an account can fail to qualify gives the same answer, so a Manager cannot probe
  // which accounts exist or why one does not qualify.
  describe('refuses anyone who is not an active Employee, always with the same 400', () => {
    let accounts: Record<string, string>;
    beforeEach(() => {
      accounts = {
        'a blocked employee': insertUser(db, {
          login: 'blocked1',
          roleId: ROLES.EMPLOYEE,
          isBlocked: true,
        }),
        'a deleted employee': insertUser(db, {
          login: 'deleted1',
          roleId: ROLES.EMPLOYEE,
          deletedAt: T0,
        }),
        'a guest': ids.guest1 as string,
        'a manager': ids.manager2 as string,
        'the administrator': ids.ADMIN as string,
        'an account that does not exist': NO_SUCH_TICKET,
      };
    });

    it.each([
      'a blocked employee',
      'a deleted employee',
      'a guest',
      'a manager',
      'the administrator',
      'an account that does not exist',
    ])('%s', async (kind) => {
      const before = rows();
      const manager = asUser('manager1');

      const response = await apiAssign(manager, idOf(A), { assignedToUserId: accounts[kind] });
      const reference = await apiAssign(manager, idOf(A), { assignedToUserId: NO_SUCH_TICKET });

      expect(response.status).toBe(400);
      expect(await fingerprint(response)).toEqual(await fingerprint(reference));
      expect(rows()).toEqual(before);
    });
  });

  it.each([
    ['employee1', 'an Employee'],
    ['guest1', 'a Guest'],
    ['ADMIN', 'the Administrator'],
  ])('answers %s (%s) with 403 whatever the ticket, and assigns nothing', async (login) => {
    const before = rows();
    const client = asUser(login);

    const existing = await apiAssign(client, idOf(A), { assignedToUserId: ids.employee1 });
    const missing = await apiAssign(client, NO_SUCH_TICKET, { assignedToUserId: ids.employee1 });

    expect(existing.status).toBe(403);
    expect(await fingerprint(existing)).toEqual(await fingerprint(missing));
    expect(rows()).toEqual(before);
  });

  it('answers a Manager on a ticket that does not exist with 404', async () => {
    const response = await apiAssign(asUser('manager1'), NO_SUCH_TICKET, {
      assignedToUserId: ids.employee1,
    });

    expect(response.status).toBe(404);
  });

  it.each([
    ['an assignee that is not a UUID', { assignedToUserId: 'employee1' }],
    ['no assignee', {}],
    ['a null assignee', { assignedToUserId: null }],
    ['an extra field', { assignedToUserId: 'x', status: 'RESOLVED' }],
  ])('refuses %s and changes nothing', async (_, input) => {
    const before = rows();

    const response = await apiAssign(asUser('manager1'), idOf(A), input);

    expect(response.status).toBe(400);
    expect(rows()).toEqual(before);
  });
});
