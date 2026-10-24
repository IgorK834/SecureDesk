// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { meResponse } from '../../__fixtures__/session';
import type { Role } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { TicketsApiService } from '../tickets/tickets-api.service';
import { Dashboard } from './dashboard';
import { EmployeeDashboard } from './employee-dashboard';
import { GuestDashboard } from './guest-dashboard';
import { ManagerDashboard } from './manager-dashboard';

// The AuthService is mocked: this spec is about which dashboard a role is given, not about how
// the session was obtained (auth.service.spec.ts and app.routes.spec.ts cover that).
function render(role: Role | null): HTMLElement {
  const user = role ? meResponse(role).user : null;
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { user: signal(user) } },
      {
        provide: TicketsApiService,
        useValue: { list: () => of({ items: [], limit: 100, offset: 0, total: 0 }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(Dashboard);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const HEADINGS: Record<Role, string> = {
  ADMINISTRATOR: 'Administrator dashboard',
  MANAGER: 'Manager dashboard',
  EMPLOYEE: 'Employee dashboard',
  GUEST: 'Guest dashboard',
};

describe('Dashboard', () => {
  it.each(Object.entries(HEADINGS) as [Role, string][])(
    'shows the %s their own dashboard: "%s"',
    (role, heading) => {
      const page = render(role);

      expect(page.querySelector('h1')?.textContent).toBe(heading);
    },
  );

  it('gives each of the four roles a distinct dashboard', () => {
    const shells = (Object.keys(HEADINGS) as Role[]).map((role) => {
      TestBed.resetTestingModule();
      return render(role).innerHTML;
    });

    expect(new Set(shells).size).toBe(4);
  });

  it('shows no dashboard at all when nobody is signed in', () => {
    expect(render(null).querySelector('h1')).toBeNull();
  });
});

describe('ticket dashboard summaries', () => {
  const ticket = (createdByUserId: string, assignedToUserId: string | null) => ({
    id: `${createdByUserId}-${assignedToUserId ?? 'none'}`,
    title: 'Ticket',
    description: 'Description',
    status: 'OPEN' as const,
    createdByUserId,
    assignedToUserId,
    createdAt: '2030-01-01T00:00:00.000Z',
    updatedAt: '2030-01-01T00:00:00.000Z',
  });

  it.each<[Type<unknown>, Role, readonly string[]]>([
    [
      ManagerDashboard,
      'MANAGER',
      ['All tickets', '3', 'Assigned to you', '1', 'Created by you', '1'],
    ],
    [EmployeeDashboard, 'EMPLOYEE', ['Assigned to you', '1', 'Created by you', '1']],
    [GuestDashboard, 'GUEST', ['You have created', '1']],
  ])('renders ticket counts in %s', async (component, role, expectedText) => {
    const me = meResponse(role);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal(me.user) } },
        {
          provide: TicketsApiService,
          useValue: {
            list: () =>
              of({
                items: [
                  ticket(me.user.id, null),
                  ticket('other', me.user.id),
                  ticket('other', null),
                ],
                limit: 100,
                offset: 0,
                total: 3,
              }),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    for (const text of expectedText) expect(fixture.nativeElement.textContent).toContain(text);
  });

  it.each<[Type<unknown>, string]>([
    [ManagerDashboard, 'Ticket counts are unavailable.'],
    [EmployeeDashboard, 'Ticket counts are unavailable.'],
    [GuestDashboard, 'Ticket count is unavailable.'],
  ])('shows a neutral unavailable state in %s', async (component, message) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal(null) } },
        {
          provide: TicketsApiService,
          useValue: { list: () => throwError(() => new Error('offline')) },
        },
      ],
    });

    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(message);
  });
});
