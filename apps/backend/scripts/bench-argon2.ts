// `npm run bench:argon2 [runs]`: prints how long Argon2id takes with the parameters configured in
// password-hasher.ts, on this machine. Paste the output into the report and docs/architecture.md
// when choosing or changing the parameters. It hashes a fixed throwaway string, never a real
// password.
import os from 'node:os';
import { ARGON2_OPTIONS, hashPassword, verifyPassword } from '../src/server/auth/password-hasher';

const DEFAULT_RUNS = 20;
const SAMPLE = 'benchmark-only-sample';

async function timeRuns(runs: number, action: () => Promise<unknown>): Promise<number[]> {
  const durations: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await action();
    durations.push(performance.now() - start);
  }
  return durations;
}

function describeDurations(label: string, durations: number[]): string {
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  const ms = (value: number) => `${value.toFixed(1)} ms`;
  return `${label}: median ${ms(median)}, mean ${ms(mean)}, min ${ms(sorted[0] ?? 0)}, max ${ms(sorted.at(-1) ?? 0)}`;
}

async function main(): Promise<void> {
  const runs = process.argv[2] === undefined ? DEFAULT_RUNS : Number(process.argv[2]);
  if (!Number.isInteger(runs) || runs < 1) {
    console.error('Usage: npm run bench:argon2 [runs]   (runs: a positive whole number)');
    process.exitCode = 1;
    return;
  }

  const { memoryCost, timeCost, parallelism } = ARGON2_OPTIONS;
  const cpu = os.cpus()[0]?.model ?? 'unknown CPU';
  console.log(`Argon2id: m=${memoryCost} KiB, t=${timeCost}, p=${parallelism}`);
  console.log(
    `Machine: ${cpu} x${os.cpus().length}, ${os.platform()} ${os.arch()}, Node ${process.version}`,
  );
  console.log(`Runs: ${runs} per operation, after one warm-up hash`);

  const hash = await hashPassword(SAMPLE);
  console.log(
    describeDurations('hashPassword  ', await timeRuns(runs, () => hashPassword(SAMPLE))),
  );
  console.log(
    describeDurations('verifyPassword', await timeRuns(runs, () => verifyPassword(hash, SAMPLE))),
  );
}

void main();
