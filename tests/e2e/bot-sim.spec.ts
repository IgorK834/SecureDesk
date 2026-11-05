import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { BotSimReport } from '../../scripts/bot-sim/types';
import { E2E_DATABASE_PATH, MODULE_2_EVIDENCE_DIR } from './helpers';

const reportPath = path.resolve('output/bot-sim-report.json');

function runBotSim(): BotSimReport {
  execFileSync(
    process.execPath,
    [
      '--experimental-strip-types',
      'scripts/bot-sim/bot-sim.ts',
      '--target',
      'http://127.0.0.1:3000',
      '--origin',
      'http://localhost:4200',
      '--database',
      E2E_DATABASE_PATH,
    ],
    { cwd: path.resolve('.'), stdio: 'pipe' },
  );
  return JSON.parse(readFileSync(reportPath, 'utf8')) as BotSimReport;
}

const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

test('SEC-31/SEC-40/SEC-49/SEC-51/SEC-55 bot simulation is repeatable and every attack meets a protection', async ({
  page,
}) => {
  const first = runBotSim();
  const second = runBotSim();

  expect(second).toStrictEqual(first);
  expect(first.scenarios).toHaveLength(9);
  for (const scenario of first.scenarios) {
    expect(Object.values(scenario.protections).some(Boolean), scenario.name).toBe(true);
  }
  expect(first.scenarios[0]?.evidence).toContainEqual(
    expect.objectContaining({ status: 400, code: 'CAPTCHA_REQUIRED' }),
  );
  expect(first.scenarios[1]?.evidence).toContainEqual(
    expect.objectContaining({ status: 429, code: 'AUTH_ACCOUNT_LOCKED' }),
  );
  expect(first.scenarios[4]?.events).toContain('HONEYPOT_TRIGGERED');
  expect(first.scenarios[5]?.events).toContain('HONEYTOKEN_TRIGGERED');
  expect(first.scenarios[7]?.evidence).toContainEqual(
    expect.objectContaining({ status: 429, code: 'AUTH_IP_BLOCKED' }),
  );
  expect(first.scenarios[8]?.events).toContain('DECOY_RESOURCE_ACCESSED');

  const rows = first.scenarios
    .map((scenario) => {
      const stopped = Object.entries(scenario.protections)
        .filter(([, reacted]) => reacted)
        .map(([name]) => name)
        .join(', ');
      const evidence = scenario.evidence
        .map(({ status, code }) => `${status}${code ? ` ${code}` : ''}`)
        .join(', ');
      return `<tr><td>${escapeHtml(`${scenario.id}. ${scenario.name}`)}</td><td>${escapeHtml(stopped)}</td><td>${escapeHtml(evidence)}</td></tr>`;
    })
    .join('');
  await page.setContent(`
    <main style="font:16px system-ui;max-width:1200px;margin:40px auto">
      <h1>SecureDesk bot simulation</h1>
      <p>Two consecutive runs produced the same protection matrix. Target: local E2E application.</p>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr><th>Scenario</th><th>Protection that reacted</th><th>HTTP evidence</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <style>th,td{padding:8px;border:1px solid #aaa;text-align:left;vertical-align:top}th{background:#14324a;color:white}</style>
    </main>
  `);
  await page.screenshot({
    path: path.join(MODULE_2_EVIDENCE_DIR, 'm2-07-bot-simulation-result.png'),
    fullPage: true,
  });
});
