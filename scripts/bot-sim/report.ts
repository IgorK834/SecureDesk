import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PROTECTIONS, type BotSimReport, type Protection, type ScenarioResult } from './types.ts';

const EVENT_PROTECTION: Partial<Record<string, Protection>> = {
  ACCOUNT_LOCKED: 'accountLock',
  LOGIN_IP_BLOCKED: 'ipBlock',
  HONEYPOT_TRIGGERED: 'honeypot',
  HONEYTOKEN_TRIGGERED: 'honeytoken',
  DECOY_RESOURCE_ACCESSED: 'honeytoken',
};

const CODE_PROTECTION: Partial<Record<string, Protection>> = {
  CAPTCHA_REQUIRED: 'captcha',
  CAPTCHA_FAILED: 'captcha',
  CAPTCHA_UNAVAILABLE: 'captcha',
  AUTH_ACCOUNT_LOCKED: 'accountLock',
  AUTH_IP_BLOCKED: 'ipBlock',
};

export function protectionResults(
  evidence: ScenarioResult['evidence'],
  events: string[],
): Record<Protection, boolean> {
  const stopped = new Set<Protection>();
  for (const item of evidence) {
    const protection = item.code ? CODE_PROTECTION[item.code] : undefined;
    if (protection) stopped.add(protection);
  }
  for (const type of events) {
    const protection = EVENT_PROTECTION[type];
    if (protection) stopped.add(protection);
  }
  return Object.fromEntries(
    PROTECTIONS.map((protection) => [protection, stopped.has(protection)]),
  ) as Record<Protection, boolean>;
}

export function buildReport(target: string, scenarios: ScenarioResult[]): BotSimReport {
  for (const scenario of scenarios) {
    if (!PROTECTIONS.some((protection) => scenario.protections[protection])) {
      throw new Error(`Scenario ${scenario.id} was not stopped or detected by any protection.`);
    }
  }
  return { version: 1, target, scenarios };
}

function evidenceText(scenario: ScenarioResult): string {
  return scenario.evidence
    .map(({ label, status, code }) => `${label}: ${status}${code ? ` ${code}` : ''}`)
    .join('; ')
    .replaceAll('|', '\\|');
}

export function reportMarkdown(report: BotSimReport): string {
  const header = [
    'Scenario',
    'CAPTCHA',
    'Account lock',
    'IP block',
    'Honeypot',
    'Honeytoken',
    'HTTP evidence',
  ];
  const separator = header.map(() => '---');
  const rows = report.scenarios.map((scenario) => [
    `${scenario.id} ${scenario.name}`,
    scenario.protections.captcha ? 'stopped' : 'not stopped',
    scenario.protections.accountLock ? 'stopped' : 'not stopped',
    scenario.protections.ipBlock ? 'stopped' : 'not stopped',
    scenario.protections.honeypot ? 'stopped' : 'not stopped',
    scenario.protections.honeytoken ? 'stopped' : 'not stopped',
    evidenceText(scenario),
  ]);
  return [
    '# Bot simulation summary',
    '',
    `Target: \`${report.target}\``,
    '',
    '“Stopped” includes a honeytoken detecting and alerting on an intentionally served decoy.',
    '',
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
    '',
  ].join('\n');
}

export function writeReports(report: BotSimReport, outputDirectory: string): void {
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(
    path.join(outputDirectory, 'bot-sim-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  writeFileSync(path.join(outputDirectory, 'bot-sim-summary.md'), reportMarkdown(report));
}

export function consoleRows(report: BotSimReport): Record<string, string>[] {
  return report.scenarios.map((scenario) => ({
    scenario: `${scenario.id} ${scenario.name}`,
    observed: scenario.evidence
      .map(({ status, code }) => `${status}${code ? ` ${code}` : ''}`)
      .join(', '),
    reacted: PROTECTIONS.filter((protection) => scenario.protections[protection]).join(', '),
  }));
}
