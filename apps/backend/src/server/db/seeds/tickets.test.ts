import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROLES, type RoleId } from '../../permissions/codes';
import { TicketParams } from '../../tickets/schemas';
import { createMigratedDb, insertUser } from '../__fixtures__/test-db';
import type { AppDb } from '../connection';
import { tickets } from '../schema';
import { seedDatabase } from '.';
import { DEMO_TICKETS, seedTickets } from './tickets';

let db: AppDb;
let ids: Record<string, string>;

const ACCOUNTS: [login: string, roleId: RoleId][] = [
  ['manager1', ROLES.MANAGER],
  ['employee1', ROLES.EMPLOYEE],
  ['employee2', ROLES.EMPLOYEE],
  ['guest1', ROLES.GUEST],
  ['guest2', ROLES.GUEST],
];

beforeEach(() => {
  db = createMigratedDb();
  ids = Object.fromEntries(
    ACCOUNTS.map(([login, roleId]) => [login, insertUser(db, { login, roleId })]),
  );
});
afterEach(() => db.$client.close());

const run = () => db.transaction((tx) => seedTickets(tx));
const stored = () =>
  db
    .select({
      id: tickets.id,
      by: tickets.createdByUserId,
      to: tickets.assignedToUserId,
      status: tickets.status,
    })
    .from(tickets)
    .all();

describe('seedTickets', () => {
  it('creates the five demo tickets, each related to the seed accounts in its own way', () => {
    expect(run()).toBe(5);

    const byId = Object.fromEntries(stored().map((row) => [row.id, row]));
    const of = (key: keyof typeof DEMO_TICKETS) => byId[DEMO_TICKETS[key].id];
    expect(of('guest1Unassigned')).toMatchObject({ by: ids.guest1, to: null });
    expect(of('guest2ToEmployee1')).toMatchObject({ by: ids.guest2, to: ids.employee1 });
    expect(of('employee1Own')).toMatchObject({ by: ids.employee1, to: null });
    expect(of('employee2ToSelf')).toMatchObject({ by: ids.employee2, to: ids.employee2 });
    expect(of('manager1ToEmployee1')).toMatchObject({ by: ids.manager1, to: ids.employee1 });
  });

  it('uses ids the API accepts, so a seeded ticket can be fetched by its id', () => {
    for (const { id } of Object.values(DEMO_TICKETS)) {
      expect(TicketParams.safeParse({ id }).success, id).toBe(true);
    }
  });

  it('covers every status, so a list shows more than one kind', () => {
    run();

    expect(new Set(stored().map((row) => row.status))).toEqual(
      new Set(['OPEN', 'IN_PROGRESS', 'RESOLVED']),
    );
  });

  it('creates nothing the second time and does not undo changes made since', () => {
    run();
    db.update(tickets)
      .set({ status: 'RESOLVED', assignedToUserId: ids.employee2 })
      .where(eq(tickets.id, DEMO_TICKETS.guest1Unassigned.id))
      .run();

    expect(run()).toBe(0);

    expect(stored()).toHaveLength(5);
    expect(stored().find((row) => row.id === DEMO_TICKETS.guest1Unassigned.id)).toMatchObject({
      status: 'RESOLVED',
      to: ids.employee2,
    });
  });

  it('fails loudly, and writes nothing, when a seed account is missing', () => {
    db.$client.exec("DELETE FROM users WHERE login = 'guest2'");

    expect(() => run()).toThrow(/unknown account "guest2"/);
    expect(stored()).toEqual([]);
  });

  it('writes plain text only: no markup that a page could render', () => {
    for (const { title, description } of Object.values(DEMO_TICKETS)) {
      expect(`${title} ${description}`).not.toMatch(/[<>]/);
    }
  });
});

describe('seedDatabase and the demo tickets', () => {
  it('adds no tickets unless asked: the demo data is opt-in', async () => {
    const result = await seedDatabase(db);

    expect(result.ticketsCreated).toBe(0);
    expect(stored()).toEqual([]);
  });

  it('adds them when asked, reports how many, and adds none on a second run', async () => {
    const first = await seedDatabase(db, { demoTickets: true });
    const second = await seedDatabase(db, { demoTickets: true });

    expect(first.ticketsCreated).toBe(5);
    expect(second.ticketsCreated).toBe(0);
    expect(stored()).toHaveLength(5);
  });
});
