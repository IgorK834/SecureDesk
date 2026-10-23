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
