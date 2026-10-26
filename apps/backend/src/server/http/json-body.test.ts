import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseJsonBody, readJsonBody } from './json-body';
import { ApiError } from './errors';

const Schema = z.object({ name: z.string() }).strict();

const post = (body: string, contentType = 'application/json') =>
  new NextRequest('http://localhost:3000/api/anything', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });

async function refusal(request: NextRequest): Promise<ApiError> {
  try {
    await parseJsonBody(request, Schema);
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected the body to be refused');
}

describe('parseJsonBody', () => {
  it.each(['application/json', 'application/json; charset=utf-8', 'Application/JSON'])(
    'returns the parsed body when it is %s and matches the schema',
    async (contentType) => {
      expect(await parseJsonBody(post('{"name":"x"}', contentType), Schema)).toStrictEqual({
        name: 'x',
      });
    },
  );

  // A cross-site form can only send these without a preflight; if they were read as JSON a
  // malicious page could drive the endpoint.
  it.each([
    ['text/plain', 'text/plain'],
    ['a form encoding', 'application/x-www-form-urlencoded'],
    ['a JSON-like but different type', 'application/vnd.api+json'],
    ['an empty Content-Type', ''],
  ])('refuses a valid body sent as %s', async (_, contentType) => {
    const error = await refusal(post('{"name":"x"}', contentType));

    expect([error.status, error.code]).toStrictEqual([415, 'UNSUPPORTED_MEDIA_TYPE']);
  });

  it.each([
    ['text that is not JSON', 'not json'],
    ['an empty body', ''],
    ['an extra key', '{"name":"x","role":"ADMINISTRATOR"}'],
    ['a wrong type', '{"name":1}'],
  ])('refuses %s with a message that reveals nothing about the cause', async (_, body) => {
    const error = await refusal(post(body));

    expect([error.status, error.code, error.message, error.details]).toStrictEqual([
      400,
      'VALIDATION_ERROR',
      'Nieprawidłowe dane żądania',
      undefined,
    ]);
  });

  // `body: ''` still gives a stream (that is the "empty body" case above). A client can also
  // send the JSON content type with no body at all, and then `request.body` is null.
  it('refuses a request that has no body at all', async () => {
    const request = new NextRequest('http://localhost:3000/api/anything', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(request.body).toBeNull(); // otherwise this would not exercise the no-body path

    const error = await refusal(request);

    expect([error.status, error.code]).toStrictEqual([400, 'VALIDATION_ERROR']);
  });
});

describe('readJsonBody size cap (SEC-25)', () => {
  it('returns 413 for a 20 KiB JSON request before parsing it', async () => {
    const request = post(JSON.stringify({ value: 'x'.repeat(20 * 1024) }));

    await expect(readJsonBody(request, { maxBytes: 16_384 })).rejects.toMatchObject({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  });
});
