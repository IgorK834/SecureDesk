// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { meResponse } from '../../__fixtures__/session';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { AppShellComponent } from './app-shell.component';

function setup(logout = of(undefined as void)) {
  const me = meResponse('MANAGER');
  const user = signal<typeof me.user | null>(me.user);
  const auth = {
    user,
    authStage: signal(me.authStage),
    has: vi.fn(() => false),
    clear: vi.fn(() => user.set(null)),
  };
  const api = { logout: vi.fn(() => logout) };
  TestBed.configureTestingModule({
    imports: [AppShellComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: AuthApiService, useValue: api },
    ],
  });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(AppShellComponent);
  fixture.detectChanges();
  return { api, auth, fixture, navigate, root: fixture.nativeElement as HTMLElement };
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
});
