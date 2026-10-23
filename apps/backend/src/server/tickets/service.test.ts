import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../http/errors';
import { createMigratedDb, insertUser } from '../db/__fixtures__/test-db';
import type { AppDb } from '../db/connection';
import { DEMO_TICKETS, seedTickets } from '../db/seeds/tickets';
import { tickets } from '../db/schema';
import { ROLES } from '../permissions/codes';
import { ROLE_PERMISSIONS } from '../permissions/matrix';
import type { TicketActor } from './policy';
import { assignTicket, createTicket, getTicket, listTickets, updateTicketStatus } from './service';

// The HTTP tests (app/api/tickets/tickets.test.ts) prove the endpoints. These prove that the
// service does not trust whoever calls it: a route that forgot its permission gate, or a future
// caller that is not a route, must still not read, change or assign what the actor may not.
let db: AppDb;
let id: Record<string, string>;

beforeEach(() => {
  db = createMigratedDb();
  id = {
    manager1: insertUser(db, { login: 'manager1', roleId: ROLES.MANAGER }),
    employee1: insertUser(db, { login: 'employee1', roleId: ROLES.EMPLOYEE }),
    employee2: insertUser(db, { login: 'employee2', roleId: ROLES.EMPLOYEE }),
    guest1: insertUser(db, { login: 'guest1', roleId: ROLES.GUEST }),
    guest2: insertUser(db, { login: 'guest2', roleId: ROLES.GUEST }),
  };
  db.transaction((tx) => seedTickets(tx));
});
afterEach(() => db.$client.close());

const actor = (login: string, roleId: keyof typeof ROLES): TicketActor => ({
  id: id[login] as string,
  permissions: ROLE_PERMISSIONS[ROLES[roleId]],
});
const manager = () => actor('manager1', 'MANAGER');
const employee1 = () => actor('employee1', 'EMPLOYEE');
const guest1 = () => actor('guest1', 'GUEST');
const noPermissions = (login: string): TicketActor => ({
  id: id[login] as string,
  permissions: [],
});

const stored = () => db.select().from(tickets).orderBy(tickets.id).all();
const thrownBy = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
};

describe('listTickets', () => {
  const FIRST_PAGE = { limit: 20, offset: 0 };

  it('returns the actor’s tickets newest first, with the size of their whole list', () => {
    const { items, total } = listTickets(db, employee1(), FIRST_PAGE);

    expect(total).toBe(3);
    expect(items.map((ticket) => ticket.id)).toEqual([
      DEMO_TICKETS.manager1ToEmployee1.id,
      DEMO_TICKETS.employee1Own.id,
      DEMO_TICKETS.guest2ToEmployee1.id,
    ]);
  });

  it('fails closed: an actor with no permission gets an empty list, not every ticket', () => {
    expect(listTickets(db, noPermissions('manager1'), FIRST_PAGE)).toEqual({ items: [], total: 0 });
  });
});

describe('createTicket', () => {
  it('makes the actor the creator, starts the ticket OPEN and leaves it unassigned', () => {
    const created = createTicket(db, guest1(), { title: 'Tytuł', description: 'Opis' });

    expect(created).toMatchObject({
      title: 'Tytuł',
      description: 'Opis',
      status: 'OPEN',
      createdByUserId: id.guest1,
      assignedToUserId: null,
    });
    expect(stored()).toHaveLength(6);
  });
});

describe('getTicket', () => {
  it('answers a ticket the actor may not read exactly like one that does not exist', () => {
    const someoneElses = thrownBy(() => getTicket(db, guest1(), DEMO_TICKETS.guest2ToEmployee1.id));
    const missing = thrownBy(() => getTicket(db, guest1(), '00000000-0000-4000-8000-0000000000ff'));

    expect(someoneElses).toBeInstanceOf(NotFoundError);
    expect(missing).toBeInstanceOf(NotFoundError);
    expect(someoneElses).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: (missing as Error).message,
    });
  });

  it('answers an actor with no permission with "not found", never with the ticket', () => {
    expect(() =>
      getTicket(db, noPermissions('manager1'), DEMO_TICKETS.guest1Unassigned.id),
    ).toThrow(NotFoundError);
  });
});

describe('updateTicketStatus', () => {
  it('refuses, and changes nothing, when the actor may read the ticket but not change it', () => {
    const before = stored();

    const error = thrownBy(() =>
      updateTicketStatus(db, guest1(), DEMO_TICKETS.guest1Unassigned.id, 'RESOLVED'),
    );

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(stored()).toEqual(before);
  });

  it('says "not found" before "forbidden" when the actor may not even read the ticket', () => {
    expect(() =>
      updateTicketStatus(db, guest1(), DEMO_TICKETS.guest2ToEmployee1.id, 'RESOLVED'),
    ).toThrow(NotFoundError);
  });

  it('rolls back: a refused change leaves no half-written row', () => {
    const before = stored();

    expect(() =>
      updateTicketStatus(db, employee1(), DEMO_TICKETS.employee1Own.id, 'RESOLVED'),
    ).toThrow(ForbiddenError);

    expect(stored()).toEqual(before);
  });
});

describe('assignTicket', () => {
  it('refuses an actor without tickets:assign before looking at the ticket at all', () => {
    const before = stored();

    const onExisting = thrownBy(() =>
      assignTicket(db, employee1(), DEMO_TICKETS.guest1Unassigned.id, id.employee2 as string),
    );
    const onMissing = thrownBy(() =>
      assignTicket(db, employee1(), '00000000-0000-4000-8000-0000000000ff', id.employee2 as string),
    );

    expect(onExisting).toBeInstanceOf(ForbiddenError);
    expect(onMissing).toBeInstanceOf(ForbiddenError); // not NotFoundError: it must not reveal anything
    expect(stored()).toEqual(before);
  });

  it('refuses an actor with no permission at all', () => {
    expect(() =>
      assignTicket(
        db,
        noPermissions('manager1'),
        DEMO_TICKETS.guest1Unassigned.id,
        id.employee1 as string,
      ),
    ).toThrow(ForbiddenError);
  });

  it('assigns to an active Employee and reports a 400 for anyone else, with one fixed detail', () => {
    const assigned = assignTicket(
      db,
      manager(),
      DEMO_TICKETS.guest1Unassigned.id,
      id.employee2 as string,
    );
    expect(assigned.assignedToUserId).toBe(id.employee2);

    const error = thrownBy(() =>
      assignTicket(db, manager(), DEMO_TICKETS.guest1Unassigned.id, id.guest2 as string),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ details: { assignedToUserId: 'NOT_AN_ACTIVE_EMPLOYEE' } });
  });
});
