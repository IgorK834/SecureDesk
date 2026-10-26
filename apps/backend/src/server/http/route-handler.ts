import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { requireStage } from '../auth/guards';
import { type ResolvedSession, touchSession } from '../auth/session-service';
import { db } from '../db/client';
import { ConflictError as DbConflictError } from '../db/errors';
import type { AuthStage } from '../db/schema';
import type { PermissionCode } from '../permissions/codes';
import { logEvent } from '../security/log-event';
import { assertCsrfProtection } from '../security/csrf';
import { ApiError, ConflictError, ValidationError, errorResponse } from './errors';
import { checkBodyHeaders, parseJsonBody } from './json-body';

/**
 * How a route authenticates. It is a required option of `defineRoute`, so a route that forgets it
 * does not compile, and a public route must say so in so many words (`'public'`). The conformance
 * test (`tests/route-guard-conformance.test.ts`) keeps the set of public routes to an allowlist.
 *
 * `stages` are the session stages that may call the route; business routes allow only
 * `FULLY_AUTHENTICATED`. `permission` is a code from `PERMISSIONS` (an unknown string does not
 * compile) or a list meaning "at least one of these", for routes whose object-level policy then
 * narrows what each role may touch. Every `/api/admin/**` route must declare one.
 */
export type RouteAuth =
  | 'public'
  | {
      readonly stages: readonly AuthStage[];
      readonly permission?: PermissionCode | readonly PermissionCode[];
    };

type Schema = z.ZodType | undefined;
type Parsed<S extends Schema> = S extends z.ZodType ? z.output<S> : undefined;

/** What a handler receives. Everything in it has already passed the pipeline. */
export interface RouteContext<
  A extends RouteAuth,
  Q extends Schema,
  B extends Schema,
  P extends Schema,
> {
  request: NextRequest;
  requestId: string;
  /** The signed-in session; `undefined` for a `'public'` route. */
  session: A extends 'public' ? undefined : ResolvedSession;
  query: Parsed<Q>;
  body: Parsed<B>;
  /** The dynamic path segments, for example `{ id }` for `/api/tickets/[id]`. */
  params: Parsed<P>;
}

export interface RouteOptions<
  A extends RouteAuth,
  Q extends Schema,
  B extends Schema,
  P extends Schema,
> {
  /** Prefix of this route's log events, for example `tickets.list`. */
  name: string;
  auth: A;
  /** Zod schema for the query string. Use `.strict()` so unknown parameters are refused. */
  query?: Q;
  /** Zod schema for the JSON body. When present, only `application/json` is accepted. */
  body?: B;
  /** Zod schema for the dynamic path segments. */
  params?: P;
  handler: (context: RouteContext<A, Q, B, P>) => Promise<Response> | Response;
}

/** The second argument Next.js gives a route handler. `params` is a Promise since Next 15. */
export interface SegmentContext {
  params: Promise<Record<string, string | string[] | undefined>>;
}

export type DefinedRoute = (request: NextRequest, context?: SegmentContext) => Promise<Response>;

const ROUTE_META = Symbol.for('securedesk.route-meta');

export interface RouteMeta {
  name: string;
  auth: RouteAuth;
}

/** What `defineRoute` recorded about a handler, or `undefined` if it was not built by it. */
export function getRouteMeta(candidate: unknown): RouteMeta | undefined {
  if (typeof candidate !== 'function') return undefined;
  return (candidate as { [ROUTE_META]?: RouteMeta })[ROUTE_META];
}

function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  return parsed.data;
}

/**
 * Turns anything a route threw into the response. An expected refusal (`ApiError`) is answered
 * with its own status and code; a database uniqueness violation becomes the same 409 as an
 * explicit `ConflictError`; anything else is a generic 500. Only the event name and the request
 * id are logged, and an unexpected error is never logged or returned, because database and
 * library errors can embed SQL, query parameters such as hashes and tokens, and file paths.
 */
function toResponse(name: string, requestId: string, error: unknown): Response {
  const refusal = error instanceof DbConflictError ? new ConflictError() : error;
  if (refusal instanceof ApiError) {
    logEvent(`${name}.denied`, requestId);
    return errorResponse(refusal.status, refusal.code, refusal.message, undefined, refusal.details);
  }
  logEvent(`${name}.error`, requestId);
  return errorResponse(500, 'INTERNAL_ERROR', 'Wystąpił błąd serwera');
}

/**
 * The one wrapper every API route handler is built with. In order:
 *
 *  1. body-size and content-type check (headers only, before anything is looked up)
 *  2. resolve the session (revoked, idle, expired, blocked or deleted all read as "no session")
 *  3. stage check: a session that owes a password change may call only what allows its stage
 *  4. permission check, read from the database on every request, never from the cookie
 *  5. same-origin and session-bound CSRF checks, before a forged request can count as activity
 *  6. record activity: the request is authenticated and authorized
 *  7. validate path parameters, query and JSON body with Zod
 *  8. the handler
 *  9. error mapping: standard envelope, no stack traces, SQL or paths
 *
 * Deny by default: a route either names who may call it or says `auth: 'public'`. The browser UI
 * only hides controls; this pipeline is the access control.
 */
export function defineRoute<
  A extends RouteAuth,
  Q extends Schema = undefined,
  B extends Schema = undefined,
  P extends Schema = undefined,
>(options: RouteOptions<A, Q, B, P>): DefinedRoute {
  const { name, auth, query, body, params, handler } = options;

  const route: DefinedRoute = async (request, segment) => {
    const requestId = randomUUID();
    try {
      checkBodyHeaders(request, body !== undefined);

      const session =
        auth === 'public'
          ? undefined
          : requireStage(request, auth.stages, { permission: auth.permission });

      // A forged request must be refused before it can count as session activity.
      assertCsrfProtection(request, session?.session);

      if (session) touchSession(db, session.session.id);

      const context = {
        request,
        requestId,
        session,
        params: params && parseInput(params, await segment?.params),
        query: query && parseInput(query, Object.fromEntries(request.nextUrl.searchParams)),
        body: body && (await parseJsonBody(request, body)),
      } as unknown as RouteContext<A, Q, B, P>;

      return await handler(context);
    } catch (error) {
      return toResponse(name, requestId, error);
    }
  };

  return Object.defineProperty(route, ROUTE_META, { value: { name, auth } satisfies RouteMeta });
}
