import { describe, expect, it, vi } from 'vitest';
import { BotHttpClient } from '../scripts/bot-sim/http-client.ts';
import { RequestBudget } from '../scripts/bot-sim/request-budget.ts';

const immediateBudget = () =>
  new RequestBudget({
    now: () => 1_000,
    wait: async () => undefined,
  });

describe('bot simulator HTTP client', () => {
  it('uses plain fetch with the required origin, JSON type and forwarded address', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'CAPTCHA_REQUIRED' } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new BotHttpClient(
      new URL('http://localhost:3000'),
      'http://localhost:4200',
      immediateBudget(),
      fetchImpl,
    );

    await expect(
      client.login('203.0.113.7, 127.0.0.1', { login: 'fake', password: 'fake' }, 'attempt'),
    ).resolves.toStrictEqual({ label: 'attempt', status: 400, code: 'CAPTCHA_REQUIRED' });
    const [, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(init.headers).toMatchObject({
      'content-type': 'application/json',
      origin: 'http://localhost:4200',
      'x-forwarded-for': '203.0.113.7, 127.0.0.1',
    });
  });

  it('issues a login challenge and exposes only the documented test-mode answer', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ challengeId: 'challenge-1', image: 'data:image/svg+xml,redacted' }),
      );
    const client = new BotHttpClient(
      new URL('http://localhost:3000'),
      'http://localhost:4200',
      immediateBudget(),
      fetchImpl,
    );

    await expect(client.challenge('203.0.113.7, 127.0.0.1')).resolves.toStrictEqual({
      challengeId: 'challenge-1',
      answer: 'TEST-SOLVED',
    });
    const [, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(init.body as string)).toStrictEqual({ purpose: 'login' });
  });
});
