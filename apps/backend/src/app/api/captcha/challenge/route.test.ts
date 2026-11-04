import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setUpSharedTestDb } from '../../../../server/db/__fixtures__/shared-test-db';
import { db } from '../../../../server/db/client';
import { captchaChallenges } from '../../../../server/db/schema';
import { POST, clearCaptchaChallengeRateLimitForTests } from './route';

setUpSharedTestDb();

beforeEach(() => {
  vi.stubEnv('CAPTCHA_LOGIN_PROVIDER', 'internal');
  vi.stubEnv('CAPTCHA_PASSWORD_CHANGE_PROVIDER', 'internal');
  vi.stubEnv('CAPTCHA_HMAC_SECRET', 'route-test-hmac-secret');
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  clearCaptchaChallengeRateLimitForTests();
});

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost:3000/api/captcha/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/captcha/challenge', () => {
  it('returns a public path-based image and stores no plaintext answer', async () => {
    const response = await post({ purpose: 'login' });
    const body = (await response.json()) as Record<string, string>;
    const svg = Buffer.from(body['image']?.split(',')[1] ?? '', 'base64').toString();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      challengeId: expect.any(String),
      image: expect.stringMatching(/^data:image\/svg\+xml;base64,/),
      expiresAt: expect.any(String),
      instruction: 'Type the characters in reverse order',
    });
    expect(svg).toContain('<path');
    expect(svg).not.toContain('<text');
    expect(JSON.stringify(body)).not.toMatch(/answer|secret|source/i);
    expect(db.select().from(captchaChallenges).all()).toEqual([
      expect.objectContaining({ answerMac: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each([{ purpose: 'unknown' }, { purpose: 'login', extra: true }, {}])(
    'strictly rejects malformed input %#',
    async (body) => {
      expect((await post(body)).status).toBe(400);
    },
  );

  it('allows twenty challenges per address and rate limits the next one', async () => {
    for (let index = 0; index < 20; index++) {
      expect((await post({ purpose: 'login' })).status).toBe(200);
    }
    expect((await post({ purpose: 'login' })).status).toBe(429);
  });

  it('purges expired rows while issuing a replacement', async () => {
    db.insert(captchaChallenges)
      .values({
        id: 'expired-row',
        purpose: 'login',
        answerMac: 'a'.repeat(64),
        expiresAt: new Date(Date.now() - 1),
        ipKey: 'unknown',
      })
      .run();

    expect((await post({ purpose: 'login' })).status).toBe(200);
    expect(
      db.select().from(captchaChallenges).where(eq(captchaChallenges.id, 'expired-row')).get(),
    ).toBeUndefined();
  });

  it('refuses to issue a challenge for a provider selected as external', async () => {
    vi.stubEnv('CAPTCHA_PASSWORD_CHANGE_PROVIDER', 'turnstile');
    vi.stubEnv('TURNSTILE_SITE_KEY', 'site-key');
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret-key');
    vi.stubEnv('CAPTCHA_EXPECTED_HOSTNAME', 'localhost');

    const response = await post({ purpose: 'change-password' });

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('CAPTCHA_PROVIDER_MISMATCH');
  });

  it('enforces the global cap on live unconsumed rows', async () => {
    const expiresAt = new Date(Date.now() + 120_000);
    db.transaction((tx) => {
      for (let index = 0; index < 1_000; index++) {
        tx.insert(captchaChallenges)
          .values({
            id: `live-${index}`,
            purpose: 'login',
            answerMac: 'a'.repeat(64),
            expiresAt,
            ipKey: `address-${index}`,
          })
          .run();
      }
    });

    const response = await post({ purpose: 'login' });

    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe('RATE_LIMITED');
  });
});
