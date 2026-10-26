import { describe, expect, it } from 'vitest';
import nextConfig from '../../../next.config';

describe('API response security headers (SEC-25)', () => {
  it('applies no-store and browser hardening to every API response without enabling CORS', async () => {
    if (!nextConfig.headers) throw new Error('Next headers() is not configured');

    const rules = await nextConfig.headers();
    const api = rules.find((rule) => rule.source === '/api/:path*');
    const headers = new Map(api?.headers.map(({ key, value }) => [key.toLowerCase(), value]));

    expect(headers.get('cache-control')).toBe('no-store');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('referrer-policy')).toBe('no-referrer');
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(headers.get('content-security-policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(headers.has('access-control-allow-origin')).toBe(false);
    expect(headers.has('access-control-allow-methods')).toBe(false);
  });
});
