// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminUser } from '../../__fixtures__/admin-users';
import type { AdminUser } from '../../core/http/admin-api.service';
import { UserStatusBadgeComponent } from './user-status-badge.component';

const NOW = new Date('2030-01-01T12:00:00.000Z');
const LOCKED_TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}).format(new Date('2030-01-01T12:15:00.000Z'));

afterEach(() => vi.useRealTimers());

function render(user: AdminUser): HTMLElement {
  const fixture = TestBed.createComponent(UserStatusBadgeComponent);
  fixture.componentRef.setInput('user', user);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('UserStatusBadgeComponent', () => {
  it.each([
    ['active', adminUser(), 'Active'],
    ['blocked', adminUser({ isBlocked: true }), 'Blocked'],
    [
      'locked',
      adminUser({ lockedUntil: '2030-01-01T12:15:00.000Z' }),
      `Locked until ${LOCKED_TIME}`,
    ],
    ['pending', adminUser({ mustChangePassword: true }), 'Pending first login'],
  ])('writes a %s account out as "%s"', (state, user, label) => {
    const badge = render(user).querySelector('.badge');

    expect(badge?.textContent?.trim()).toBe(label);
    expect(badge?.classList.contains(`badge-${state}`)).toBe(true);
  });

  it('gives the four states four different looks as well as four different words', () => {
    const classes = [
      adminUser(),
      adminUser({ isBlocked: true }),
      adminUser({ lockedUntil: '2030-01-01T12:15:00.000Z' }),
      adminUser({ mustChangePassword: true }),
    ].map((user) => render(user).querySelector('.badge')?.className);

    expect(new Set(classes).size).toBe(4);
  });

  it('flags a pending account whose temporary password has expired', () => {
    vi.useFakeTimers({ now: NOW });
    const user = adminUser({
      mustChangePassword: true,
      temporaryPasswordExpiresAt: '2030-01-01T11:59:59.999Z',
    });

    expect(render(user).textContent).toContain('Temporary password expired');
  });

  it('does not flag a pending account whose password is still valid', () => {
    vi.useFakeTimers({ now: NOW });
    const user = adminUser({
      mustChangePassword: true,
      temporaryPasswordExpiresAt: '2030-01-01T12:00:00.001Z',
    });

    expect(render(user).textContent).not.toContain('expired');
  });

  it('does not flag a blocked account, even with an old deadline: it is Blocked, nothing else', () => {
    vi.useFakeTimers({ now: NOW });
    const user = adminUser({
      isBlocked: true,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: '2020-01-01T00:00:00.000Z',
    });

    const page = render(user);

    expect(page.querySelector('.badge')?.textContent?.trim()).toBe('Blocked');
    expect(page.textContent).not.toContain('expired');
  });
});
