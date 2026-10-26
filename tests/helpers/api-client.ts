// Test helper: calls exported Next.js route handlers (`GET`, `POST`, ...) directly with real
// `Request`s and keeps a cookie jar between calls, the way a browser would. Tests therefore
// exercise the whole API pipeline (session, stage, permission, validation, error mapping) without
// Angular and without starting a server.
import { NextRequest } from 'next/server';
import { sessionCookieName } from '../../apps/backend/src/server/auth/cookie';
import { XSRF_COOKIE_NAME, XSRF_HEADER_NAME } from '../../apps/backend/src/server/security/csrf';

export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

/** What Next.js passes a route handler as its second argument. */
interface SegmentContext {
  params: Promise<Record<string, string | string[] | undefined>>;
}

type Handler = (request: NextRequest, context?: SegmentContext) => Promise<Response> | Response;

/** A route module as imported: `import * as route from '.../route'`. */
export type RouteModule = Partial<Record<HttpMethod, Handler>>;

export interface CallOptions {
  /** Sent as the JSON body, with `Content-Type: application/json`. */
  json?: unknown;
  /** Sent as the body exactly as given (for malformed or oversized payloads). */
  body?: BodyInit;
  headers?: Record<string, string>;
  /** Dynamic path segments, for example `{ id }` for `/api/tickets/[id]`. */
  params?: Record<string, string>;
}

const ORIGIN = 'http://localhost:3000';

export class ApiClient {
  private readonly jar = new Map<string, string>();

  /** Signs in the way the app does: the session token travels only in the cookie. */
  signIn(session: string | { token: string; csrfToken: string }): this {
    const token = typeof session === 'string' ? session : session.token;
    this.jar.set(sessionCookieName(), token);
    if (typeof session !== 'string') this.jar.set(XSRF_COOKIE_NAME, session.csrfToken);
    return this;
  }

  cookie(name: string): string | undefined {
    return this.jar.get(name);
  }

  async request(
    route: RouteModule,
    method: HttpMethod,
    path: string,
    options: CallOptions = {},
  ): Promise<Response> {
    const handler = route[method];
    if (!handler) throw new Error(`The route module does not export ${method}.`);

    const headers = new Headers(options.headers);
    const stateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (stateChanging && !headers.has('origin')) headers.set('origin', ORIGIN);
    const xsrfToken = this.jar.get(XSRF_COOKIE_NAME);
    if (stateChanging && xsrfToken && !headers.has(XSRF_HEADER_NAME)) {
      headers.set(XSRF_HEADER_NAME, xsrfToken);
    }
    if (this.jar.size > 0) {
      headers.set('cookie', [...this.jar].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    if (options.json !== undefined) headers.set('content-type', 'application/json');

    const request = new NextRequest(`${ORIGIN}${path}`, {
      method,
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    });
    const context = { params: Promise.resolve(options.params ?? {}) };

    const response = await handler(request, context);
    this.store(response);
    return response;
  }

  get = (route: RouteModule, path: string, options?: CallOptions) =>
    this.request(route, 'GET', path, options);
  post = (route: RouteModule, path: string, options?: CallOptions) =>
    this.request(route, 'POST', path, options);
  patch = (route: RouteModule, path: string, options?: CallOptions) =>
    this.request(route, 'PATCH', path, options);
  delete = (route: RouteModule, path: string, options?: CallOptions) =>
    this.request(route, 'DELETE', path, options);

  // A browser keeps what Set-Cookie says and drops a cookie that is cleared or already expired.
  private store(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair = '', ...attributes] = header.split(';').map((part) => part.trim());
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      const cleared = attributes.some((attribute) => /^max-age=0$/i.test(attribute));
      if (cleared || value === '') this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }
}

export const createApiClient = () => new ApiClient();
