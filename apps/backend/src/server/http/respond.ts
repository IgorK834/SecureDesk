import { NextResponse } from 'next/server';

/**
 * A JSON success response that no cache may keep. Ticket data is for one signed-in user and must
 * not be served from a shared cache or the back button to the next person.
 */
export function noStoreJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
