import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { ApiError, ValidationError } from './errors';

/**
 * The largest request body any route reads. The biggest legitimate body is a ticket description
 * (5000 characters, at most 4 bytes each in UTF-8, plus JSON escaping), so 64 KiB is far above
 * need and still far below anything that could strain the process.
 */
export const MAX_BODY_BYTES = 64 * 1024;

const payloadTooLarge = () => new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Żądanie jest zbyt duże');

const mediaTypeOf = (request: NextRequest): string | undefined =>
  request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();

/**
 * The checks that need only the request headers, so they are cheap enough to run before the
 * session is even looked up: a declared `Content-Length` above the limit is refused (413), and a
 * route that reads a JSON body refuses any other `Content-Type` (400).
 *
 * Only `application/json` is accepted: a cross-site HTML form can send `text/plain` or a form
 * encoding without a CORS preflight, so refusing every other type keeps such a form from driving
 * the endpoint (login CSRF, forged password change).
 */
export function checkBodyHeaders(request: NextRequest, expectsJsonBody: boolean): void {
  const declared = Number(request.headers.get('content-length'));
  if (declared > MAX_BODY_BYTES) throw payloadTooLarge();
  if (expectsJsonBody && mediaTypeOf(request) !== 'application/json') throw new ValidationError();
}

/**
 * Reads the body as text but never more than `MAX_BODY_BYTES`. `Content-Length` can be absent or
 * a lie (chunked uploads), so the limit is enforced on the bytes actually received, and reading
 * stops as soon as it is passed.
 */
async function readCappedText(request: NextRequest): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BODY_BYTES) {
      await reader.cancel();
      throw payloadTooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Reads the JSON body of a state-changing request and validates it against a strict schema, or
 * throws `ValidationError` (400) or, for an oversized body, 413 (use `defineRoute`). The refusal
 * never says what was wrong, so it cannot echo anything the client sent.
 *
 * A body of another content type, or one that is not valid JSON, is validated as `undefined`,
 * which a schema rejects.
 */
export async function parseJsonBody<Schema extends z.ZodType>(
  request: NextRequest,
  schema: Schema,
): Promise<z.output<Schema>> {
  let body: unknown;
  if (mediaTypeOf(request) === 'application/json') {
    try {
      body = JSON.parse(await readCappedText(request));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      body = undefined;
    }
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  return parsed.data;
}
