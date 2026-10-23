import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { GET, dynamic, runtime } from './route';

const health = () => GET(new NextRequest('http://localhost:3000/api/health'));

// The health endpoint is reachable without authentication, so it must never leak
// anything beyond liveness (no versions, no secrets) and must never be cached.
describe('GET /api/health', () => {
  it('returns 200 with exactly { status: "ok" } and nothing else', async () => {
    const response = await health();

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ status: 'ok' });
  });

  it('is marked no-store so a stale "ok" is never served from a cache', async () => {
    expect((await health()).headers.get('Cache-Control')).toBe('no-store');
  });

  it('runs on the Node.js runtime and is never statically rendered', () => {
    expect(runtime).toBe('nodejs');
    expect(dynamic).toBe('force-dynamic');
  });
});
