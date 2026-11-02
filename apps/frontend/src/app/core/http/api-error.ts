import { HttpErrorResponse } from '@angular/common/http';

/**
 * What a failed API call comes down to for the UI: the HTTP status (0 when there was no answer at
 * all) and the machine-readable `error.code` of the server's envelope, when there is one. The
 * server's message text is deliberately not read: the UI words its own messages.
 */
export function describeApiError(error: unknown): { status: number; code?: string } {
  if (!(error instanceof HttpErrorResponse)) return { status: 0 };
  const code = (error.error as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? { status: error.status, code } : { status: error.status };
}

export interface ApiErrorDetails {
  retryAfterSeconds?: number;
  lockedUntil?: string;
}

/** Reads only the numeric/ISO fields the login countdown is allowed to trust. */
export function apiErrorDetails(error: unknown): ApiErrorDetails {
  if (!(error instanceof HttpErrorResponse)) return {};
  const details = (
    error.error as {
      error?: { details?: { retryAfterSeconds?: unknown; lockedUntil?: unknown } };
    } | null
  )?.error?.details;
  if (!details) return {};

  const retryAfterSeconds = details.retryAfterSeconds;
  const lockedUntil = details.lockedUntil;
  return {
    ...(typeof retryAfterSeconds === 'number' &&
      Number.isInteger(retryAfterSeconds) &&
      retryAfterSeconds >= 0 && { retryAfterSeconds }),
    ...(typeof lockedUntil === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(lockedUntil) &&
      !Number.isNaN(Date.parse(lockedUntil)) && { lockedUntil }),
  };
}

/** Reads only the allowlisted list shape used by password-policy errors, never server prose. */
export function passwordPolicyViolations(error: unknown): string[] {
  if (!(error instanceof HttpErrorResponse)) return [];
  const violations = (error.error as { error?: { details?: { violations?: unknown } } } | null)
    ?.error?.details?.violations;
  return Array.isArray(violations)
    ? violations.filter((violation): violation is string => typeof violation === 'string')
    : [];
}
