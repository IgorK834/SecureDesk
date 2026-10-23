import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../http/api-client.service';
import type { AuthStage, MeResponse, Permission, SessionUser } from './auth.models';

type Session = Pick<MeResponse, 'user' | 'authStage' | 'permissions'>;

/**
 * The signed-in user as the SERVER sees them. The state lives only in memory and is rebuilt from
 * the HttpOnly session cookie through `GET /api/auth/me` (`load()`, run before the app starts), so
 * a reload restores it without credentials. Nothing about the session is ever written to browser
 * storage. This is a UX mirror of server state, not a source of authority: see `auth.guard.ts`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiClient);
  // One signal for the whole session, so user, stage and permissions can never be out of step.
  private readonly session = signal<Session | null>(null);
  private readonly settled = signal(false);

  readonly user = computed<SessionUser | null>(() => this.session()?.user ?? null);
  readonly authStage = computed<AuthStage | null>(() => this.session()?.authStage ?? null);
  readonly permissions = computed<readonly string[]>(() => this.session()?.permissions ?? []);
  /** True once the first `load()` has finished, whatever its outcome. */
  readonly loaded = this.settled.asReadonly();

  /**
   * Asks the server who the cookie belongs to. Never rejects, so a failure cannot stop the app
   * from starting: the user is then simply "not signed in" (fail closed) and the guards send
   * them to /login.
   */
  async load(): Promise<void> {
    try {
      const { user, authStage, permissions } = await firstValueFrom(this.api.me());
      this.session.set({ user, authStage, permissions });
    } catch (error) {
      this.session.set(null);
      // 401 only means that nobody is signed in. Anything else (server down, bad response)
      // still ends up as "signed out", but must not pass silently.
      if (!(error instanceof HttpErrorResponse && error.status === 401)) {
        console.error('Could not restore the session from /api/auth/me', error);
      }
    } finally {
      this.settled.set(true);
    }
  }

  /**
   * True if the role holds the permission (any one of them, when given a list). Like the backend,
   * a session that still owes a password change holds nothing: such a session may only change
   * its password.
   */
  has(permission: Permission | readonly Permission[]): boolean {
    if (this.authStage() !== 'FULLY_AUTHENTICATED') return false;
    const wanted = typeof permission === 'string' ? [permission] : permission;
    const held = this.permissions();
    return wanted.some((code) => held.includes(code));
  }

  /** Forgets the session in this tab. It does not end the session on the server. */
  clear(): void {
    this.session.set(null);
  }
}
