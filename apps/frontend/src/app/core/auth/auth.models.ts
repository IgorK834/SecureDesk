/** The server-side session stage reported by `GET /api/auth/me`. */
export type AuthStage = 'INITIAL_PASSWORD_CHANGE' | 'PASSWORD_EXPIRED' | 'FULLY_AUTHENTICATED';

/** Role codes exactly as the server sends them (upper-case). */
export type Role = 'ADMINISTRATOR' | 'MANAGER' | 'EMPLOYEE' | 'GUEST';

/**
 * Every permission code the server can grant, as in `docs/permissions.md`. A typo in a route or
 * navigation entry is a compile error; `tests/role-navigation.test.ts` fails if this list drifts
 * from the backend's.
 */
export const PERMISSION_CODES = [
  'users:read',
  'users:create',
  'users:update',
  'users:block',
  'users:delete',
  'users:reset-password',
  'security-settings:read',
  'security-settings:update',
  'tickets:create',
  'tickets:read:all',
  'tickets:read:assigned',
  'tickets:read:own',
  'tickets:assign',
  'tickets:status:update:all',
  'tickets:status:update:assigned',
] as const;

export type Permission = (typeof PERMISSION_CODES)[number];

/** Any one of these opens the ticket list and detail pages (the backend's `READ_TICKETS`). */
export const READ_TICKETS: readonly Permission[] = [
  'tickets:read:all',
  'tickets:read:assigned',
  'tickets:read:own',
];

/** The profile of the signed-in user: never a password hash, session token or internal flag. */
export interface SessionUser {
  id: string;
  login: string;
  firstName: string;
  lastName: string;
  role: Role;
}

/** Body of `GET /api/auth/me`. */
export interface MeResponse {
  user: SessionUser;
  authStage: AuthStage;
  mustChangePassword: boolean;
  /** Plain strings: a code this client does not know simply never matches. */
  permissions: string[];
}
