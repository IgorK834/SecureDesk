import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseJsonBody } from './json-body';
import { ApiError } from './route';

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

    expect([error.status, error.code]).toStrictEqual([400, 'VALIDATION_ERROR']);
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
});
