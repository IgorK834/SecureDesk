import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { ApiError, ValidationError } from './errors';

/**
 * The largest request body any route reads. The biggest legitimate body is a ticket description
 * (5000 ordinary text characters plus JSON framing). The cap is deliberately applied to bytes,
 * before parsing, so an attacker cannot make JSON decoding allocate an unbounded value.
 */
export const MAX_BODY_BYTES = 16_384;

const payloadTooLarge = () => new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Żądanie jest zbyt duże');
const unsupportedMediaType = () =>
  new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Wymagany Content-Type application/json');

const mediaTypeOf = (request: NextRequest): string | undefined =>
  request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();

/**
 * The checks that need only the request headers, so they are cheap enough to run before the
 * session is even looked up: a declared `Content-Length` above the limit is refused (413), and a
 * route that reads a JSON body refuses any other `Content-Type` (415).
 *
 * Only `application/json` is accepted: a cross-site HTML form can send `text/plain` or a form
 * encoding without a CORS preflight, so refusing every other type keeps such a form from driving
 * the endpoint (login CSRF, forged password change).
 */
export function checkBodyHeaders(request: NextRequest, expectsJsonBody: boolean): void {
  const declared = Number(request.headers.get('content-length'));
  if (declared > MAX_BODY_BYTES) throw payloadTooLarge();
  if (expectsJsonBody && mediaTypeOf(request) !== 'application/json') {
    throw unsupportedMediaType();
  }
}

/**
 * Reads the body as text but never more than the supplied limit. `Content-Length` can be absent
 * or a lie (chunked uploads), so the limit is enforced on the bytes actually received, and
 * reading stops as soon as it is passed.
 */
async function readCappedText(request: NextRequest, maxBytes: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw payloadTooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Strict JSON reader used by every route that accepts a body. */
export async function readJsonBody(
  request: NextRequest,
  { maxBytes = MAX_BODY_BYTES }: { maxBytes?: number } = {},
): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'));
  if (declared > maxBytes) throw payloadTooLarge();
  if (mediaTypeOf(request) !== 'application/json') throw unsupportedMediaType();
  try {
    return JSON.parse(await readCappedText(request, maxBytes));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ValidationError();
  }
}

/**
 * Reads the JSON body of a state-changing request and validates it against a strict schema, or
 * throws `ValidationError` (400) or, for an oversized body, 413 (use `defineRoute`). The refusal
 * never says what was wrong, so it cannot echo anything the client sent.
 *
 * A body of another content type is refused with 415 before parsing; malformed JSON and schema
 * failures share the generic 400 validation response.
 */
export async function parseJsonBody<Schema extends z.ZodType>(
  request: NextRequest,
  schema: Schema,
): Promise<z.output<Schema>> {
  const body = await readJsonBody(request, { maxBytes: MAX_BODY_BYTES });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  return parsed.data;
}
