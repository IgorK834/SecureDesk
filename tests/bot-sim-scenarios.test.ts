import { describe, expect, it, vi } from 'vitest';
import { FAKE_CREDENTIALS, SEEDED_LOGINS_WITHOUT_PASSWORDS } from '../scripts/bot-sim/fixtures.ts';
import type { BotHttp } from '../scripts/bot-sim/http-client.ts';
import { scenarioDefinitions } from '../scripts/bot-sim/scenarios.ts';

function fakeHttp() {
  let challenge = 0;
  const http: BotHttp = {
    request: vi.fn(async (path) => ({ label: path, status: 200 })),
    challenge: vi.fn(async () => ({
      challengeId: `challenge-${++challenge}`,
      answer: 'TEST-SOLVED',
    })),
    login: vi.fn(async (_forwarded, _body, label) => ({
      label,
      status: label.includes('IP-limit') ? 429 : 401,
      ...(label.includes('IP-limit') && { code: 'AUTH_IP_BLOCKED' }),
    })),
  };
  return http;
}

describe('bot simulator scenarios', () => {
  it('contains the nine required scenarios and only clearly fake stuffing credentials', () => {
    expect(scenarioDefinitions(fakeHttp(), (scenario) => `2001:db8::${scenario}`)).toHaveLength(9);
    expect(FAKE_CREDENTIALS).toHaveLength(20);
    for (const fixture of FAKE_CREDENTIALS) {
      expect(`${fixture.login}:${fixture.password}`).toMatch(/fake-only/i);
    }
  });

  it('sprays one fake password across every seeded login and reaches the address limit', async () => {
    const http = fakeHttp();
    const spraying = scenarioDefinitions(http, (scenario) => `2001:db8::${scenario}`)[3];
    const evidence = await spraying?.execute();
    const bodies = vi.mocked(http.login).mock.calls.map((call) => call[1]);

    for (const login of SEEDED_LOGINS_WITHOUT_PASSWORDS) {
      expect(bodies).toContainEqual(expect.objectContaining({ login }));
    }
    expect(new Set(bodies.map((body) => body.password))).toStrictEqual(
      new Set(['FAKE-ONLY-WRONG-PASSWORD!']),
    );
    expect(evidence?.at(-1)).toMatchObject({ status: 429, code: 'AUTH_IP_BLOCKED' });
  });

  it('replays exactly the same one-time challenge without requesting another', async () => {
    const http = fakeHttp();
    const replay = scenarioDefinitions(http, (scenario) => `2001:db8::${scenario}`)[6];
    await replay?.execute();

    expect(http.challenge).toHaveBeenCalledTimes(1);
    expect(vi.mocked(http.login).mock.calls[0]?.[1].captcha).toStrictEqual(
      vi.mocked(http.login).mock.calls[1]?.[1].captcha,
    );
  });
});
