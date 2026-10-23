// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { type Observable, Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminUser, apiFailure, userPage } from '../../__fixtures__/admin-users';
import { AuthService } from '../../core/auth/auth.service';
import {
  AdminApi,
  type AdminUserPage,
  type AdminUserQuery,
} from '../../core/http/admin-api.service';
import { FILTER_DEBOUNCE_MS, PAGE_SIZE, UsersListComponent } from './users-list.component';

const NOW = new Date('2030-01-01T12:00:00.000Z');

const USERS = [
  adminUser({ id: 'u-1', login: 'alice', firstName: 'Alice', lastName: 'Active' }),
  adminUser({
    id: 'u-2',
    login: 'bob',
    firstName: 'Bob',
    lastName: 'Blocked',
    role: 'MANAGER',
    isBlocked: true,
  }),
  adminUser({
    id: 'u-3',
    login: 'carol',
    firstName: 'Carol',
    lastName: 'Pending',
    role: 'GUEST',
    mustChangePassword: true,
    temporaryPasswordExpiresAt: '2030-01-01T11:00:00.000Z', // an hour ago
  }),
  adminUser({
    id: 'u-4',
    login: 'dave',
    firstName: 'Dave',
    lastName: 'Fresh',
    mustChangePassword: true,
    temporaryPasswordExpiresAt: '2030-01-01T23:00:00.000Z', // still valid
  }),
];

afterEach(() => vi.useRealTimers());

type ListResult = Observable<AdminUserPage>;

function setUp(options: { granted?: string[]; list?: (query: AdminUserQuery) => ListResult } = {}) {
  const { granted = ['users:read', 'users:create'] } = options;
  const list: (query: AdminUserQuery) => ListResult = options.list ?? (() => of(userPage(USERS)));
  const api = { list: vi.fn(list) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AdminApi, useValue: api },
      { provide: AuthService, useValue: { has: (p: string) => granted.includes(p) } },
    ],
  });
  const fixture = TestBed.createComponent(UsersListComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;

  return {
    api,
    root,
    flush: () => fixture.detectChanges(),
    text: () => root.textContent ?? '',
    rows: () => [...root.querySelectorAll('tbody tr')],
    cells: (row: Element) => [...row.querySelectorAll('td')].map((c) => c.textContent?.trim()),
    button: (label: string) =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label),
    type(value: string) {
      const input = root.querySelector('input[type="search"]') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    },
    choose(label: string, value: string) {
      const select = [...root.querySelectorAll('label')]
        .find((l) => l.textContent?.includes(label))
        ?.querySelector('select') as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new Event('change'));
    },
  };
}

const lastQuery = (api: { list: ReturnType<typeof vi.fn> }) => api.list.mock.calls.at(-1)?.[0];

describe('UsersListComponent: the table', () => {
  it('asks for the first page, unfiltered, as soon as it opens', () => {
    const { api } = setUp();

    expect(api.list).toHaveBeenCalledExactlyOnceWith({
      q: undefined,
      role: undefined,
      status: undefined,
      page: 1,
      pageSize: PAGE_SIZE,
    });
  });

  it('shows login, name, role, status and created date for each account', () => {
    const { rows, cells, root } = setUp();

    expect(root.querySelectorAll('thead th')).toHaveLength(5);
    expect(rows()).toHaveLength(4);
    expect(cells(rows()[0] as Element)).toStrictEqual([
      'alice',
      'Alice Active',
      'Employee',
      'Active',
      '2030-01-01',
    ]);
    expect(cells(rows()[1] as Element)[2]).toBe('Manager');
  });

  it('links each login to the detail page of that account', () => {
    const { root } = setUp();

    const hrefs = [...root.querySelectorAll('tbody a')].map((a) => a.getAttribute('href'));

    expect(hrefs).toStrictEqual([
      '/admin/users/u-1',
      '/admin/users/u-2',
      '/admin/users/u-3',
      '/admin/users/u-4',
    ]);
  });

  it('tells Active, Blocked and Pending first login apart, in words', () => {
    vi.useFakeTimers({ now: NOW });
    const { rows, cells } = setUp();

    const statuses = rows().map((row) => cells(row)[3]);

    expect(statuses[0]).toBe('Active');
    expect(statuses[1]).toBe('Blocked');
    expect(statuses[2]).toContain('Pending first login');
    expect(statuses[3]).toContain('Pending first login');
  });

  it('adds the "expired" hint only to a pending account whose temporary password ran out', () => {
    vi.useFakeTimers({ now: NOW });
    const { rows, cells } = setUp();

    const [alice, bob, carol, dave] = rows().map((row) => cells(row)[3]);

    expect(carol).toContain('Temporary password expired');
    expect(alice).not.toContain('expired');
    expect(bob).not.toContain('expired');
    expect(dave).not.toContain('expired');
  });

  it('shows names as text: markup in a name is displayed, never run', () => {
    const hostile = adminUser({
      id: 'u-9',
      login: 'mallory',
      firstName: '<img src=x onerror=alert(1)>',
      lastName: '<script>alert(2)</script>',
    });
    const { root, rows, cells } = setUp({ list: () => of(userPage([hostile])) });

    expect(cells(rows()[0] as Element)[1]).toBe(
      '<img src=x onerror=alert(1)> <script>alert(2)</script>',
    );
    expect(root.querySelector('img, script')).toBeNull();
  });

  it('says so when no account matches, rather than showing an empty table', () => {
    const { text, root } = setUp({ list: () => of(userPage([])) });

    expect(text()).toContain('No users match these filters.');
    expect(root.querySelector('table')).toBeNull();
  });

  it('asks the server on every visit and keeps no copy, so an account deleted meanwhile is gone', () => {
    const answers = [userPage(USERS), userPage(USERS.slice(1))];
    const { api, rows } = setUp({ list: () => of(answers.shift() as AdminUserPage) });
    expect(rows()).toHaveLength(4);

    TestBed.resetTestingModule();
    const second = setUp({ list: () => of(answers[0] as AdminUserPage) });

    expect(api.list).toHaveBeenCalledTimes(1);
    expect(second.api.list).toHaveBeenCalledTimes(1);
    expect(second.rows()).toHaveLength(3);
    expect(second.text()).not.toContain('alice');
  });
});

describe('UsersListComponent: "New user"', () => {
  it('is offered to someone who may create users', () => {
    const { root } = setUp({ granted: ['users:read', 'users:create'] });

    expect(root.querySelector('a[href="/admin/users/new"]')).not.toBeNull();
  });

  it('is not offered to someone who may not (the server would refuse it anyway)', () => {
    const { root } = setUp({ granted: ['users:read'] });

    expect(root.querySelector('a[href="/admin/users/new"]')).toBeNull();
  });
});

describe('UsersListComponent: filters and the 300 ms pause', () => {
  it('uses a pause of 300 ms', () => {
    expect(FILTER_DEBOUNCE_MS).toBe(300);
  });

  it('does not ask while the text is still changing, and asks once it has paused for 300 ms', () => {
    vi.useFakeTimers();
    const { api, type, flush } = setUp();
    expect(api.list).toHaveBeenCalledTimes(1);

    type('ali');
    vi.advanceTimersByTime(FILTER_DEBOUNCE_MS - 1);
    flush();
    expect(api.list).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    flush();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(lastQuery(api)).toMatchObject({ q: 'ali', page: 1 });
  });

  it('sends one request for a burst of keystrokes, each one restarting the wait', () => {
    vi.useFakeTimers();
    const { api, type, flush } = setUp();

    for (const text of ['a', 'al', 'ali', 'alic', 'alice']) {
      type(text);
      vi.advanceTimersByTime(FILTER_DEBOUNCE_MS - 100);
      flush();
    }
    expect(api.list).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    flush();

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(lastQuery(api)).toMatchObject({ q: 'alice' });
  });

  it('does not ask again for text that was typed and taken back before the pause ended', () => {
    vi.useFakeTimers();
    const { api, type, flush } = setUp();

    type('x');
    vi.advanceTimersByTime(100);
    type('');
    vi.advanceTimersByTime(FILTER_DEBOUNCE_MS);
    flush();

    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('filters by role and by status the same way', () => {
    vi.useFakeTimers();
    const { api, choose, flush } = setUp();

    choose('Role', 'GUEST');
    choose('Status', 'pending');
    vi.advanceTimersByTime(FILTER_DEBOUNCE_MS);
    flush();

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(lastQuery(api)).toMatchObject({ role: 'GUEST', status: 'pending', page: 1 });
  });

  it('offers every role and every status, and "all" for each', () => {
    const { root } = setUp();

    const options = [...root.querySelectorAll('select')].map((s) =>
      [...s.options].map((o) => o.textContent?.trim()),
    );

    expect(options).toStrictEqual([
      ['All roles', 'Administrator', 'Manager', 'Employee', 'Guest'],
      ['All statuses', 'Active', 'Blocked', 'Pending first login'],
    ]);
  });

  it('can be cleared back to "all", which sends no filter at all', () => {
    vi.useFakeTimers();
    const { api, choose, flush } = setUp();
    choose('Role', 'GUEST');
    vi.advanceTimersByTime(FILTER_DEBOUNCE_MS);
    flush();

    choose('Role', '');
    vi.advanceTimersByTime(FILTER_DEBOUNCE_MS);
    flush();

    expect(lastQuery(api)).toMatchObject({ role: undefined, status: undefined, q: undefined });
  });

  it('sends the text as typed: it is the API client that trims and encodes it', () => {
    vi.useFakeTimers();
    const { api, type, flush } = setUp();

    type('100%_\\');
    vi.advanceTimersByTime(FILTER_DEBOUNCE_MS);
    flush();

    expect(lastQuery(api)).toMatchObject({ q: '100%_\\' });
  });

  it('never lets a slow, outdated answer replace a newer one', () => {
    vi.useFakeTimers();
    const slow = new Subject<AdminUserPage>();
    const fast = new Subject<AdminUserPage>();
    const queue: ListResult[] = [of(userPage(USERS)), slow, fast];
    const { type, flush, rows, cells } = setUp({ list: () => queue.shift() as ListResult });

    type('a');
    vi.advanceTimersByTime(FILTER_DEBOUNCE_MS);
    flush(); // request 2 (slow) is in flight
    type('al');
    vi.advanceTimersByTime(FILTER_DEBOUNCE_MS);
    flush(); // request 3 (fast) replaces it

    fast.next(userPage([USERS[0] as (typeof USERS)[number]]));
    flush();
    slow.next(userPage([USERS[1] as (typeof USERS)[number]])); // arrives late
    flush();

    expect(rows()).toHaveLength(1);
    expect(cells(rows()[0] as Element)[0]).toBe('alice');
  });
});

describe('UsersListComponent: pagination', () => {
  const many = (page: number) => userPage(USERS, { page, total: 45 }); // 3 pages of 20

  it('shows no pager when everything fits on one page', () => {
    const { root } = setUp();

    expect(root.querySelector('nav[aria-label="Pagination"]')).toBeNull();
  });

  it('shows the page and the number of pages, with Previous disabled on the first page', () => {
    const { text, button } = setUp({ list: () => of(many(1)) });

    expect(text()).toContain('Page 1 of 3');
    expect((button('Previous') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Next') as HTMLButtonElement).disabled).toBe(false);
  });

  it('moves forward and back, asking the server for that page', () => {
    const { api, button, flush, text } = setUp({ list: () => of(many(1)) });

    button('Next')?.click();
    flush();
    expect(lastQuery(api)).toMatchObject({ page: 2 });
    expect(text()).toContain('Page 2 of 3');

    button('Previous')?.click();
    flush();
    expect(lastQuery(api)).toMatchObject({ page: 1 });
  });

  it('disables Next on the last page', () => {
    const { button, flush } = setUp({ list: () => of(many(1)) });

    button('Next')?.click();
    flush();
    button('Next')?.click();
    flush();

    expect((button('Next') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Previous') as HTMLButtonElement).disabled).toBe(false);
  });

  it('cannot run past the last page when Next is pressed twice before the page re-renders', () => {
    const { api, button, flush, text } = setUp({ list: () => of(many(1)) });
    button('Next')?.click();
    flush(); // now on page 2 of 3

    const next = button('Next') as HTMLButtonElement;
    next.click();
    next.click(); // the button is not yet disabled in the DOM, as in a fast double-click
    flush();

    expect(lastQuery(api)).toMatchObject({ page: 3 });
    expect(text()).toContain('Page 3 of 3');
  });

  it('starts again from page 1 when a filter changes, with one request and not two', () => {
    vi.useFakeTimers();
    const { api, button, type, flush } = setUp({ list: () => of(many(1)) });
    button('Next')?.click();
    flush();
    expect(lastQuery(api)).toMatchObject({ page: 2 });
    const before = api.list.mock.calls.length;

    type('ali');
    vi.advanceTimersByTime(FILTER_DEBOUNCE_MS);
    flush();

    expect(api.list.mock.calls.length).toBe(before + 1);
    expect(lastQuery(api)).toMatchObject({ q: 'ali', page: 1 });
  });
});

describe('UsersListComponent: when the list cannot be shown', () => {
  it('says "loading" while the answer is on its way', () => {
    const { text } = setUp({ list: () => new Subject<AdminUserPage>() });

    expect(text()).toContain('Loading users');
  });

  it('explains a 403 plainly, without offering a pointless retry', () => {
    const { text, button, root } = setUp({ list: () => throwError(() => apiFailure(403)) });

    expect(text()).toContain('not allowed to view users');
    expect(button('Try again')).toBeUndefined();
    expect(root.querySelector('table')).toBeNull();
  });

  it('sends a signed-out visitor (401) to sign in again', () => {
    const { root } = setUp({ list: () => throwError(() => apiFailure(401)) });

    expect(root.textContent).toContain('Your session has ended');
    expect(root.querySelector('a[href="/login"]')).not.toBeNull();
  });

  it('offers to try again after any other failure, and asks the same question again', () => {
    const answers: ListResult[] = [throwError(() => apiFailure(500)), of(userPage(USERS))];
    const { api, button, flush, text, rows } = setUp({ list: () => answers.shift() as ListResult });
    expect(text()).toContain('Could not load users');

    button('Try again')?.click();
    flush();

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(lastQuery(api)).toStrictEqual(api.list.mock.calls[0]?.[0]);
    expect(rows()).toHaveLength(4);
  });

  it('treats a network failure like any other failure', () => {
    const { text } = setUp({ list: () => throwError(() => new Error('offline')) });

    expect(text()).toContain('Could not load users');
  });
});
