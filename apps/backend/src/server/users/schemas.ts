import { z } from 'zod';
import type { RoleId } from '../permissions/codes';

// Input schemas of the administrator's user endpoints. All of them are strict: a field that is not
// listed (`passwordHash`, `isBlocked`, `login` on an edit, `role_id`, ...) is refused with a 400,
// never silently ignored, so a client cannot reach a privileged column by naming it.

/** The role as clients write it: the upper-case form of the role id (see `toAdminUserDto`). */
export const ROLE_CODES = ['ADMINISTRATOR', 'MANAGER', 'EMPLOYEE', 'GUEST'] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const roleIdOf = (code: RoleCode): RoleId => code.toLowerCase() as Lowercase<RoleCode>;

/** `pending` is an account that has not yet replaced its administrator-issued password. */
export const USER_STATUSES = ['active', 'blocked', 'pending'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** The longest search text worth accepting: nothing it could match is longer (names: 64). */
export const SEARCH_MAX_LENGTH = 64;

/** `/api/admin/users/[id]`: a malformed id is refused before the database is asked about it. */
export const UserParams = z.object({ id: z.uuid() }).strict();

export const ListUsersQuery = z
  .object({
    q: z.string().trim().max(SEARCH_MAX_LENGTH).optional(),
    role: z.enum(ROLE_CODES).optional(),
    status: z.enum(USER_STATUSES).optional(),
    page: z.coerce.number().int().min(1).default(1),
    // Too large a page is refused (400), not silently shrunk, so a client learns the limit.
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .strict();

const name = z.string().trim().min(1).max(64);

/** Plain text: stored exactly as sent and never interpreted as HTML. */
export const CreateUserBody = z
  .object({
    login: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._-]{3,32}$/),
    firstName: name,
    lastName: name,
    // The Administrator role cannot be handed out through the API.
    role: z.enum(['MANAGER', 'EMPLOYEE', 'GUEST']),
  })
  .strict();

/**
 * The only fields an edit may touch. `ADMINISTRATOR` is a valid value here so that asking for it
 * is answered with 409 `PROTECTED_ACCOUNT` by the service, rather than 400 as an unknown role.
 */
export const UpdateUserBody = z
  .object({
    firstName: name.optional(),
    lastName: name.optional(),
    role: z.enum(ROLE_CODES).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0);

/** A reset takes no input: the administrator does not choose the password, the server does. */
export const ResetPasswordBody = z.object({}).strict();

export type CreateUserInput = z.infer<typeof CreateUserBody>;
export type UpdateUserInput = z.infer<typeof UpdateUserBody>;
