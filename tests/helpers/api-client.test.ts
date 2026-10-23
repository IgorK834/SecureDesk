import { NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import { sessionCookieName } from '../../apps/backend/src/server/auth/cookie';
import { type RouteModule, createApiClient } from './api-client';

// The helper is what every API integration test stands on, so its own behaviour is pinned: a jar
// that lied about what a browser would send would make those tests pass or fail for no reason.

const echo: RouteModule = {
  POST: async (request, context) =>
    NextResponse.json({
      method: request.method,
      cookie: request.headers.get('cookie'),
      contentType: request.headers.get('content-type'),
      body: await request.text(),
      params: await context?.params,
    }),
};

const setCookie = (...headers: string[]): RouteModule => ({
  POST: () => {
    const response = new NextResponse(null, { status: 204 });
    for (const header of headers) response.headers.append('set-cookie', header);
    return response;
  },
});

describe('createApiClient', () => {
  it('sends a JSON body with the matching Content-Type, and the dynamic path segments', async () => {
    const response = await createApiClient().post(echo, '/api/things/7', {
      json: { a: 1 },
      params: { id: '7' },
    });

    expect(await response.json()).toStrictEqual({
      method: 'POST',
      cookie: null,
      contentType: 'application/json',
      body: '{"a":1}',
      params: { id: '7' },
    });
  });

  it('sends a raw body untouched and without inventing a Content-Type', async () => {
    const response = await createApiClient().post(echo, '/api/things', { body: 'not json' });

    expect(await response.json()).toMatchObject({
      body: 'not json',
      contentType: 'text/plain;charset=UTF-8',
    });
  });

  it('signs in through the session cookie and sends it on every later call', async () => {
    const client = createApiClient().signIn('token-123');

    const response = await client.post(echo, '/api/things');

    expect(((await response.json()) as { cookie: string }).cookie).toBe(
      `${sessionCookieName()}=token-123`,
    );
  });

  it('keeps a cookie the server sets and sends it back, like a browser', async () => {
    const client = createApiClient();
    await client.post(setCookie(`${sessionCookieName()}=issued; Path=/; HttpOnly`), '/api/login');

    expect(client.cookie(sessionCookieName())).toBe('issued');
    expect(((await (await client.post(echo, '/api/x')).json()) as { cookie: string }).cookie).toBe(
      `${sessionCookieName()}=issued`,
    );
  });

  it('drops a cookie the server clears (Max-Age=0), as logout does', async () => {
    const client = createApiClient().signIn('token-123');

    await client.post(setCookie(`${sessionCookieName()}=; Path=/; Max-Age=0`), '/api/logout');

    expect(client.cookie(sessionCookieName())).toBeUndefined();
  });

  it('replaces the session cookie when the server rotates it', async () => {
    const client = createApiClient().signIn('old');

    await client.post(setCookie(`${sessionCookieName()}=new; Path=/`), '/api/change-password');

    expect(client.cookie(sessionCookieName())).toBe('new');
  });

  it('fails loudly when the route module does not export the method', async () => {
    await expect(createApiClient().get(echo, '/api/things')).rejects.toThrow('does not export GET');
  });
});
