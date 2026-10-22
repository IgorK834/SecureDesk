import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { ApiError } from './route';

/**
 * Reads the JSON body of a state-changing request and validates it against a strict schema, or
 * throws `ApiError` 400 `VALIDATION_ERROR` (use the route wrapper). The refusal never says what
 * was wrong, so it cannot echo anything the client sent.
 *
 * Only `application/json` is read, as in the login route: a cross-site HTML form can send
 * `text/plain` without a CORS preflight, so refusing every other type keeps such a form from
 * driving the endpoint. Anything else, or a body that is not valid JSON, is validated as
 * `undefined`, which a schema rejects.
 */
export async function parseJsonBody<Schema extends z.ZodType>(
  request: NextRequest,
  schema: Schema,
): Promise<z.output<Schema>> {
  const mediaType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  const body: unknown =
    mediaType === 'application/json' ? await request.json().catch(() => undefined) : undefined;
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Nieprawidłowe dane żądania');
  return parsed.data;
}
