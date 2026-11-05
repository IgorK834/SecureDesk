import { existsSync } from 'node:fs';
import path from 'node:path';
import { SqliteScenarioStore } from './database.ts';
import { validateE2eDatabase, validateTarget } from './guards.ts';
import { BotHttpClient } from './http-client.ts';
import { RequestBudget } from './request-budget.ts';
import { buildReport, consoleRows, writeReports } from './report.ts';
import { runScenarios } from './runner.ts';
import { scenarioDefinitions } from './scenarios.ts';

const LEGAL_DISCLAIMER =
  'LEGAL: Run this simulator only against an application you own or are explicitly authorized to test.';

interface CliOptions {
  target: string;
  origin?: string;
  database: string;
  allowHost?: string;
}

export function parseCli(argv: string[], env: NodeJS.ProcessEnv = process.env): CliOptions {
  const options: CliOptions = {
    target: 'http://127.0.0.1:3000',
    database: env.E2E_DATABASE_PATH ?? path.resolve('data/securedesk.e2e.sqlite'),
  };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--target', '--origin', '--database', '--allow-host'].includes(flag ?? '') || !value) {
      throw new Error(`Unknown or incomplete argument: ${flag ?? '(empty)'}`);
    }
    index += 1;
    if (flag === '--target') options.target = value;
    if (flag === '--origin') options.origin = value;
    if (flag === '--database') options.database = value;
    if (flag === '--allow-host') options.allowHost = value;
  }
  return options;
}

function addressFactory(): (scenario: number) => string {
  const runSegment = (process.pid % 65_535).toString(16);
  return (scenario) => `2001:db8:${runSegment}:${scenario.toString(16)}::10`;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  console.log(LEGAL_DISCLAIMER);
  const options = parseCli(argv);
  const target = validateTarget(options.target, {
    allowHost: options.allowHost,
    ownershipConfirmed: process.env.BOTSIM_I_OWN_THE_TARGET,
  });
  const databasePath = validateE2eDatabase(options.database);
  if (!existsSync(databasePath)) throw new Error(`E2E database does not exist: ${databasePath}`);
  const origin = new URL(options.origin ?? target.origin).origin;
  const store = new SqliteScenarioStore(databasePath);
  try {
    const budget = new RequestBudget();
    const client = new BotHttpClient(target, origin, budget);
    const scenarios = await runScenarios(scenarioDefinitions(client, addressFactory()), store);
    const report = buildReport(target.origin, scenarios);
    writeReports(report, path.resolve('output'));
    console.table(consoleRows(report));
    console.log(`Wrote ${path.resolve('output/bot-sim-report.json')}`);
    console.log(`Wrote ${path.resolve('output/bot-sim-summary.md')}`);
  } finally {
    store.close();
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Bot simulator failed.');
  process.exitCode = 1;
});
