import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureOutput } from '../__fixtures__/capture-output';
import { ApiError, errorResponse, handleRoute } from './route';

afterEach(() => vi.restoreAllMocks());

const request = () => new NextRequest('http://localhost:3000/api/anything');

describe('errorResponse', () => {
  it('uses the standard error shape and is never cacheable', async () => {
    const response = errorResponse(403, 'SOME_CODE', 'Komunikat');

    expect(response.status).toBe(403);
    expect(await response.json()).toStrictEqual({
      error: { code: 'SOME_CODE', message: 'Komunikat' },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('adds extra headers without losing no-store', () => {
    const response = errorResponse(429, 'C', 'm', { 'Retry-After': '30' });

    expect(response.headers.get('Retry-After')).toBe('30');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('handleRoute', () => {
  it('returns the handler’s own response and passes it the request and a request id', async () => {
    const handler = vi.fn(() => new Response('ok', { status: 201 }));
    const req = request();

    const response = await handleRoute('test.route', handler)(req);

    expect(response.status).toBe(201);
    expect(handler).toHaveBeenCalledWith(req, expect.stringMatching(/^[0-9a-f-]{36}$/));
  });

  it('awaits an asynchronous handler', async () => {
    const response = await handleRoute(
      'test.route',
      async () => new Response('late', { status: 202 }),
    )(request());

    expect(response.status).toBe(202);
  });

  it('gives every request its own id', async () => {
    const ids: string[] = [];
    const route = handleRoute('test.route', (_, requestId) => {
      ids.push(requestId);
      return new Response(null);
    });

    await route(request());
    await route(request());

    expect(new Set(ids).size).toBe(2);
  });

  it('turns an ApiError into its status, code and message, and logs only the event and request id', async () => {
    const output = captureOutput();
    const route = handleRoute('test.route', () => {
      throw new ApiError(401, 'AUTH_REQUIRED', 'Wymagane zalogowanie');
    });

    const response = await route(request());
    const lines = output.lines();
    output.restore();

    expect(response.status).toBe(401);
    expect(await response.json()).toStrictEqual({
      error: { code: 'AUTH_REQUIRED', message: 'Wymagane zalogowanie' },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toStrictEqual({
      event: 'test.route.denied',
      requestId: expect.any(String),
    });
  });

  it('answers any other failure with a generic 500 that reveals and logs nothing about it', async () => {
    const output = captureOutput();
    const route = handleRoute('test.route', () => {
      throw new Error('SQLITE_ERROR near "token_hash=abc123" $argon2id$leaked');
    });

    const response = await route(request());
    const lines = output.lines();
    output.restore();

    expect(response.status).toBe(500);
    expect(await response.json()).toStrictEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Wystąpił błąd serwera' },
    });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ event: 'test.route.error' });
    expect(lines.join('\n')).not.toMatch(/SQLITE|abc123|argon2|leaked/);
  });

  it('also handles a rejected promise from an asynchronous handler', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const route = handleRoute('test.route', async () => {
      throw new ApiError(403, 'AUTH_FORBIDDEN', 'Brak uprawnień');
    });

    expect((await route(request())).status).toBe(403);
  });
});

describe('ApiError', () => {
  it('carries the status, code and message and is recognisable as an Error', () => {
    const error = new ApiError(403, 'AUTH_FORBIDDEN', 'Brak uprawnień');

    expect(error).toBeInstanceOf(Error);
    expect([error.status, error.code, error.message, error.name]).toStrictEqual([
      403,
      'AUTH_FORBIDDEN',
      'Brak uprawnień',
      'ApiError',
    ]);
  });
});
