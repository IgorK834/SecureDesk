// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { meResponse } from '../../__fixtures__/session';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { AppShellComponent } from './app-shell.component';
import { SecurityAlertService } from './security-alert.service';

@Component({ template: '' })
class BlankPage {}

function setup(logout = of(undefined as void), granted = false) {
  const me = meResponse('MANAGER');
  const user = signal<typeof me.user | null>(me.user);
  const auth = {
    user,
    authStage: signal(me.authStage),
    has: vi.fn(() => granted),
    clear: vi.fn(() => user.set(null)),
  };
  const api = { logout: vi.fn(() => logout) };
  const critical = signal(0);
  const alerts = {
    unacknowledgedCritical: critical,
    load: vi.fn(),
    clear: vi.fn(() => critical.set(0)),
  };
  TestBed.configureTestingModule({
    imports: [AppShellComponent],
    providers: [
      provideRouter([
        { path: 'first', component: BlankPage },
        { path: 'second', component: BlankPage },
      ]),
      { provide: AuthService, useValue: auth },
      { provide: AuthApiService, useValue: api },
      { provide: SecurityAlertService, useValue: alerts },
    ],
  });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(AppShellComponent);
  fixture.detectChanges();
  return {
    alerts,
    api,
    auth,
    fixture,
    navigate,
    root: fixture.nativeElement as HTMLElement,
    router,
  };
}

describe('AppShellComponent', () => {
  it('shows the signed-in user, role and logout control', () => {
    const { root } = setup();

    expect(root.querySelector('header')?.textContent).toContain('Ann Test');
    expect(root.querySelector('header')?.textContent).toContain('Manager');
    expect(root.querySelector('button')?.textContent).toContain('Logout');
  });

  it('removes the authenticated frame as soon as auth is cleared', () => {
    const { auth, fixture, root } = setup();

    auth.user.set(null);
    fixture.detectChanges();

    expect(root.querySelector('header')).toBeNull();
    expect(root.querySelector('app-main-nav')).toBeNull();
    expect(fixture.componentInstance['roleLabel']()).toBe('');
  });

  it('sends one logout request, then clears auth and opens login', () => {
    const pending = new Subject<void>();
    const { api, auth, fixture, navigate, root } = setup(pending);
    const button = root.querySelector('button') as HTMLButtonElement;

    button.click();
    fixture.detectChanges();
    fixture.componentInstance['logout']();
    expect(api.logout).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);

    pending.next();
    pending.complete();
    expect(auth.clear).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('still clears auth and opens login when logout fails', () => {
    const { auth, navigate, root } = setup(throwError(() => new Error('offline')));

    (root.querySelector('button') as HTMLButtonElement).click();

    expect(auth.clear).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('loads the critical count once per navigation and never polls', async () => {
    vi.useFakeTimers();
    const { alerts, navigate, router } = setup(of(undefined as void), true);
    navigate.mockRestore();
    await router.navigateByUrl('/first');
    expect(alerts.load).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(alerts.load).toHaveBeenCalledOnce();
    await router.navigateByUrl('/second');
    expect(alerts.load).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('shows the administrator banner and removes it when the count is cleared', () => {
    const { alerts, fixture, root } = setup(of(undefined as void), true);
    alerts.unacknowledgedCritical.set(1);
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      '1 unacknowledged critical',
    );
    alerts.clear();
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });
});
