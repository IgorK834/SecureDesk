import { describe, expect, it } from 'vitest';
import {
  buildReport,
  consoleRows,
  protectionResults,
  reportMarkdown,
} from '../scripts/bot-sim/report.ts';

describe('bot simulator report builder', () => {
  it('maps HTTP codes and stored events to the five protection columns', () => {
    expect(
      protectionResults(
        [
          { label: 'captcha', status: 403, code: 'CAPTCHA_FAILED' },
          { label: 'blocked', status: 429, code: 'AUTH_IP_BLOCKED' },
        ],
        ['ACCOUNT_LOCKED', 'HONEYPOT_TRIGGERED', 'DECOY_RESOURCE_ACCESSED'],
      ),
    ).toStrictEqual({
      captcha: true,
      accountLock: true,
      ipBlock: true,
      honeypot: true,
      honeytoken: true,
    });
  });

  it('builds deterministic JSON, Markdown and console rows', () => {
    const scenario = {
      id: '1',
      name: 'missing CAPTCHA',
      evidence: [{ label: 'attempt', status: 400, code: 'CAPTCHA_REQUIRED' }],
      events: ['CAPTCHA_FAILED'],
      protections: protectionResults(
        [{ label: 'attempt', status: 400, code: 'CAPTCHA_REQUIRED' }],
        ['CAPTCHA_FAILED'],
      ),
    };
    const report = buildReport('http://localhost:3000', [scenario]);

    expect(report).toStrictEqual(buildReport('http://localhost:3000', [scenario]));
    expect(reportMarkdown(report)).toContain('| 1 missing CAPTCHA | stopped | not stopped |');
    expect(reportMarkdown(report)).toContain('attempt: 400 CAPTCHA_REQUIRED');
    expect(consoleRows(report)).toStrictEqual([
      {
        scenario: '1 missing CAPTCHA',
        observed: '400 CAPTCHA_REQUIRED',
        reacted: 'captcha',
      },
    ]);
  });

  it('rejects a scenario for which no requested protection reacted', () => {
    expect(() =>
      buildReport('http://localhost:3000', [
        {
          id: 'x',
          name: 'unprotected',
          evidence: [{ label: 'request', status: 200 }],
          events: [],
          protections: protectionResults([{ label: 'request', status: 200 }], []),
        },
      ]),
    ).toThrow(/not stopped or detected/);
  });
});
