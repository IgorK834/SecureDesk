import { redact } from './redact';

/**
 * Writes one structured log line holding only the event name and the request id. That is all the
 * authentication code is allowed to log: never a request body, password, hash or token. The line
 * still passes through `redact` so that a field added here later cannot leak by accident.
 */
export function logEvent(event: string, requestId: string): void {
  console.info(JSON.stringify(redact({ event, requestId })));
}
