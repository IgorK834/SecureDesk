// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { meResponse } from '../../__fixtures__/session';
import type { Role } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { Dashboard } from './dashboard';

// The AuthService is mocked: this spec is about which dashboard a role is given, not about how
// the session was obtained (auth.service.spec.ts and app.routes.spec.ts cover that).
function render(role: Role | null): HTMLElement {
  const user = role ? meResponse(role).user : null;
  TestBed.configureTestingModule({
    providers: [{ provide: AuthService, useValue: { user: signal(user) } }],
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
