// STAND-IN for Task 3.2 (defineRoute). It holds only what the authentication routes share: the
// standard error shape, an error type guards can throw, and a wrapper that turns thrown errors
// into responses without ever exposing or logging their details.
import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { logEvent } from '../security/log-event';

/** An expected refusal: the status, machine-readable code and Polish message the client sees. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The standard error response. Never cacheable. */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { 'Cache-Control': 'no-store', ...headers } },
  );
}

/**
 * Wraps a route handler: gives the request an id, answers an `ApiError` with its own status and
 * code, and answers anything else with a generic 500. Only the event name and the request id are
 * logged; an unexpected error is not, because database and library errors can embed query
 * parameters such as hashes and tokens.
 */
export function handleRoute(
  name: string,
  handler: (request: NextRequest, requestId: string) => Promise<Response> | Response,
) {
  return async (request: NextRequest): Promise<Response> => {
    const requestId = randomUUID();
    try {
      return await handler(request, requestId);
    } catch (error) {
      if (error instanceof ApiError) {
        logEvent(`${name}.denied`, requestId);
        return errorResponse(error.status, error.code, error.message);
      }
      logEvent(`${name}.error`, requestId);
      return errorResponse(500, 'INTERNAL_ERROR', 'Wystąpił błąd serwera');
    }
  };
}
