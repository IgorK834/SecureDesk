/**
 * Keeps the "Security controls at a glance" table of README.md in step with docs/testing.md.
 *
 *   node --experimental-strip-types scripts/readme-controls.ts           rewrite the table
 *   node --experimental-strip-types scripts/readme-controls.ts --check   fail when README.md is stale
 *
 * Each control lists where it is implemented and which SEC scenarios prove it. The script fails
 * when a listed file or scenario does not exist, and when a scenario in docs/testing.md belongs to
 * no control, so a new test cannot be added without deciding which control it evidences.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

const root = resolve(import.meta.dirname, '..');
const readmePath = join(root, 'README.md');
const START = '<!-- controls:start -->';
const END = '<!-- controls:end -->';

interface Control {
  name: string;
  where: string[];
  /** Scenario numbers: single (`3`) or inclusive ranges (`18-23`). */
  tests: string[];
}

const BACKEND = 'apps/backend/src/server';

const CONTROLS: Control[] = [
  {
    name: 'Argon2id password storage',
    where: [`${BACKEND}/auth/password-hasher.ts`],
    tests: ['3'],
  },
  {
    name: 'Uniform login failures (no account enumeration)',
    where: [`${BACKEND}/auth/login-service.ts`],
    tests: ['1', '2', '34'],
  },
  {
    name: 'Temporary credentials and forced first change',
    where: [`${BACKEND}/auth/temporary-password.ts`],
    tests: ['4-8'],
  },
  {
    name: 'Password policy and history',
    where: [`${BACKEND}/auth/password-policy.ts`],
    tests: ['9-14'],
  },
  {
    name: 'Role and object-level authorization',
    where: [`${BACKEND}/permissions/matrix.ts`, `${BACKEND}/tickets/policy.ts`],
    tests: ['15-17', '28', '29'],
  },
  {
    name: 'Revocable sessions, idle and absolute timeouts',
    where: [`${BACKEND}/auth/session-service.ts`],
    tests: ['18-23', '30'],
  },
  { name: 'CSRF protection', where: [`${BACKEND}/security/csrf.ts`], tests: ['24'] },
  {
    name: 'SQL injection and XSS resistance',
    where: [`${BACKEND}/security/sql-lint.test.ts`],
    tests: ['25', '26'],
  },
  {
    name: 'Rate limiting and account lockout',
    where: [`${BACKEND}/security/rate-limiter.ts`, `${BACKEND}/auth/login-guard.ts`],
    tests: ['27', '31-33', '35-39'],
  },
  {
    name: 'CAPTCHA (local, Turnstile, reCAPTCHA)',
    where: [`${BACKEND}/security/captcha/index.ts`],
    tests: ['40-48'],
  },
  {
    name: 'Honeypot field and honeytokens',
    where: [`${BACKEND}/security/honeytokens.ts`],
    tests: ['49-54'],
  },
  {
    name: 'Address blocks and password-spraying detection',
    where: [`${BACKEND}/security/ip-block-service.ts`, `${BACKEND}/security/attempt-tracker.ts`],
    tests: ['55-57', '59', '60'],
  },
  {
    name: 'Security events for administrators',
    where: [`${BACKEND}/security/events.ts`, `${BACKEND}/security/event-admin.ts`],
    tests: ['58'],
  },
  {
    name: 'Safe attack simulation and production start-up checks',
    where: ['scripts/bot-sim/guards.ts', 'apps/backend/src/instrumentation.ts'],
    tests: ['61', '62'],
  },
  {
    name: 'Audit recording of security-relevant actions',
    where: [`${BACKEND}/audit/append.ts`, `${BACKEND}/audit/events.ts`],
    tests: ['63-73'],
  },
  {
    name: 'Append-only, hash-chained audit table',
    where: [`${BACKEND}/audit/chain.ts`, `${BACKEND}/db/migrations/0007_protect_audit_log.sql`],
    tests: ['74-78'],
  },
  {
    name: 'Audit log browsing and export',
    where: [`${BACKEND}/audit/queries.ts`, `${BACKEND}/audit/export.ts`],
    tests: ['79-81'],
  },
  {
    name: 'Integrity verification and tamper detection',
    where: [`${BACKEND}/audit/verify.ts`, `${BACKEND}/audit/anchor.ts`],
    tests: ['82-87', '96'],
  },
  {
    name: 'Detection rules and alerts',
    where: [`${BACKEND}/detection/engine.ts`, `${BACKEND}/alerts/file-alert-dispatcher.ts`],
    tests: ['88-93'],
  },
  {
    name: 'Canarytokens webhook and Loki shipping',
    where: [`${BACKEND}/security/canary-webhook.ts`, `${BACKEND}/audit/ship-loki.ts`],
    tests: ['94', '95'],
  },
];

function expand(spec: string): number[] {
  const [from, to = from] = spec.split('-').map(Number);
  if (!Number.isInteger(from) || !Number.isInteger(to) || (to as number) < (from as number)) {
    throw new Error(`Invalid scenario spec: ${spec}`);
  }
  return Array.from(
    { length: (to as number) - (from as number) + 1 },
    (_, i) => (from as number) + i,
  );
}

const id = (n: number) => `SEC-${String(n).padStart(2, '0')}`;
const testing = readFileSync(join(root, 'docs/testing.md'), 'utf8');
const documented = new Set(
  [...testing.matchAll(/^\| (SEC-\d{2}) \|/gm)].map((match) => match[1] as string),
);

const problems: string[] = [];
const mapped = new Set<string>();
for (const control of CONTROLS) {
  for (const file of control.where) {
    if (!existsSync(join(root, file))) problems.push(`${control.name}: missing file ${file}`);
  }
  for (const n of control.tests.flatMap(expand)) {
    if (!documented.has(id(n)))
      problems.push(`${control.name}: ${id(n)} is not in docs/testing.md`);
    if (mapped.has(id(n))) problems.push(`${id(n)} is listed under more than one control`);
    mapped.add(id(n));
  }
}
for (const scenario of documented) {
  if (!mapped.has(scenario)) {
    problems.push(
      `${scenario} is in docs/testing.md but under no control in scripts/readme-controls.ts`,
    );
  }
}
if (problems.length > 0) {
  console.error(problems.map((problem) => `- ${problem}`).join('\n'));
  process.exit(1);
}

function testsCell(control: Control): string {
  return control.tests
    .map((spec) => {
      const [from, to] = spec.split('-').map(Number);
      return to === undefined
        ? id(from as number)
        : `${id(from as number)} to ${String(to).padStart(2, '0')}`;
    })
    .join(', ');
}

const whereCell = (control: Control) =>
  control.where.map((file) => `[\`${file.split('/').slice(-2).join('/')}\`](${file})`).join(', ');

const table = [
  `${documented.size} automated scenarios in [\`docs/testing.md\`](docs/testing.md) prove the controls below; \`npm test\` fails if one loses its test.`,
  '',
  '| Control | Implemented in | Scenarios |',
  '| --- | --- | --- |',
  ...CONTROLS.map((c) => `| ${c.name} | ${whereCell(c)} | ${testsCell(c)} |`),
].join('\n');

const readme = readFileSync(readmePath, 'utf8');
const start = readme.indexOf(START);
const end = readme.indexOf(END);
if (start === -1 || end === -1 || end < start) {
  console.error(`README.md must contain ${START} and ${END}.`);
  process.exit(1);
}

const next = readme.slice(0, start + START.length) + `\n\n${table}\n\n` + readme.slice(end);
const formatted = await format(next, {
  ...(await resolveConfig(readmePath)),
  filepath: readmePath,
});

if (process.argv.includes('--check')) {
  if (formatted !== readme) {
    console.error(
      'README.md security controls table is stale. Run: node --experimental-strip-types scripts/readme-controls.ts',
    );
    process.exit(1);
  }
  console.log(
    `README controls table is current: ${CONTROLS.length} controls, ${documented.size} scenarios.`,
  );
} else {
  writeFileSync(readmePath, formatted);
  console.log(
    `README controls table written: ${CONTROLS.length} controls, ${documented.size} scenarios.`,
  );
}
