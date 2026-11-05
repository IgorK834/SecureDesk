import {
  FAKE_CREDENTIALS,
  FAKE_WRONG_PASSWORD,
  SEEDED_LOGINS_WITHOUT_PASSWORDS,
} from './fixtures.ts';
import type { BotHttp } from './http-client.ts';
import type { HttpEvidence } from './types.ts';

export interface ScenarioDefinition {
  id: string;
  name: string;
  execute(): Promise<HttpEvidence[]>;
}

const loginBody = (
  login: string,
  captcha?: { challengeId: string; answer: string },
  extra: Record<string, unknown> = {},
) => ({ login, password: FAKE_WRONG_PASSWORD, ...(captcha && { captcha }), ...extra });

export function scenarioDefinitions(
  http: BotHttp,
  addressFor: (scenario: number) => string,
): ScenarioDefinition[] {
  const chain = (address: string) => `${address}, 127.0.0.1`;
  const freshLogin = async (address: string, login: string, label: string) => {
    const forwarded = chain(address);
    const proof = await http.challenge(forwarded);
    return http.login(forwarded, loginBody(login, proof), label);
  };

  return [
    {
      id: '1',
      name: 'naive brute force without CAPTCHA',
      execute: async () => [
        await http.login(chain(addressFor(1)), loginBody('employee1'), 'missing CAPTCHA attempt'),
      ],
    },
    {
      id: '2',
      name: 'CAPTCHA-solving brute force',
      execute: async () => {
        const evidence: HttpEvidence[] = [];
        for (let attempt = 1; attempt <= 6; attempt++) {
          const result = await freshLogin(
            addressFor(2),
            'employee1',
            `solved CAPTCHA attempt ${attempt}`,
          );
          evidence.push(result);
          if (result.code === 'AUTH_ACCOUNT_LOCKED') break;
        }
        return evidence;
      },
    },
    {
      id: '3',
      name: 'credential stuffing with fake fixtures',
      execute: async () => {
        const address = addressFor(3);
        const evidence: HttpEvidence[] = [];
        for (const [index, fixture] of FAKE_CREDENTIALS.entries()) {
          const forwarded = chain(address);
          const proof = await http.challenge(forwarded);
          evidence.push(
            await http.login(
              forwarded,
              { ...fixture, captcha: proof },
              `fake credential ${index + 1}`,
            ),
          );
        }
        evidence.push(
          await http.login(chain(address), loginBody('fake-only-overflow'), 'IP-limit probe'),
        );
        return evidence;
      },
    },
    {
      id: '4',
      name: 'password spraying',
      execute: async () => {
        const address = addressFor(4);
        const evidence: HttpEvidence[] = [];
        const targets = [...SEEDED_LOGINS_WITHOUT_PASSWORDS, 'fake-only-spray-target'];
        for (let index = 0; index < 20; index++) {
          const login = targets[index % targets.length];
          evidence.push(await freshLogin(address, login as string, `spray attempt ${index + 1}`));
        }
        evidence.push(
          await http.login(chain(address), loginBody('employee1'), 'spray IP-limit probe'),
        );
        return evidence;
      },
    },
    {
      id: '5',
      name: 'honeypot-filling form bot',
      execute: async () => [
        await http.login(
          chain(addressFor(5)),
          loginBody('fake-only-honeypot', undefined, { website: 'https://bot.invalid' }),
          'filled honeypot',
        ),
      ],
    },
    {
      id: '6',
      name: 'trap-account probing',
      execute: async () => [await freshLogin(addressFor(6), 'backup_admin', 'account trap')],
    },
    {
      id: '7',
      name: 'CAPTCHA replay',
      execute: async () => {
        const forwarded = chain(addressFor(7));
        const proof = await http.challenge(forwarded);
        return [
          await http.login(forwarded, loginBody('fake-only-replay', proof), 'first use'),
          await http.login(forwarded, loginBody('fake-only-replay', proof), 'replay'),
        ];
      },
    },
    {
      id: '8',
      name: 'X-Forwarded-For rotation',
      execute: async () => {
        const stableAddress = addressFor(8);
        const evidence: HttpEvidence[] = [];
        for (let attempt = 1; attempt <= 21; attempt++) {
          const forged = `198.51.100.${attempt}`;
          evidence.push(
            await http.login(
              `${forged}, ${stableAddress}, 127.0.0.1`,
              loginBody(`fake-only-forwarded-${attempt}`),
              `rotated header ${attempt}`,
            ),
          );
        }
        return evidence;
      },
    },
    {
      id: '9',
      name: 'backup decoy fetch',
      execute: async () => [
        {
          ...(await http.request('/api/backup/config', { method: 'GET' }, chain(addressFor(9)))),
          label: 'decoy fetch',
        },
      ],
    },
  ];
}
