import { spawnSync } from 'node:child_process';
import { copyFileSync, globSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const evidence = process.argv.includes('--evidence');
const flags = process.argv.slice(2).filter((arg) => arg !== '--evidence');
const supplied = process.env.SECUREDESK_E2E_DIR;
const temp = realpathSync(supplied ?? mkdtempSync(path.join(tmpdir(), 'securedesk-module3-')));
if (
  ![tmpdir(), '/tmp'].some((base) => {
    const relative = path.relative(realpathSync(base), temp);
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  })
) {
  throw new Error('Module 3 requires an isolated directory under the system temporary directory.');
}
try {
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--retries=0',
      ...flags,
      'tests/e2e/audit-log.spec.ts',
      'tests/e2e/audit-integrity.spec.ts',
      'tests/e2e/detection.spec.ts',
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        SECUREDESK_E2E_DIR: temp,
        DATABASE_PATH: path.join(temp, 'dev.sqlite'),
        TEST_DATABASE_PATH: path.join(temp, 'test.sqlite'),
        LOKI_PUSH_URL: '',
        ALERT_WEBHOOK_URL: '',
        CANARYTOKENS_WEBHOOK_SECRET: '',
      },
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  if (process.exitCode === 0 && evidence) {
    const screenshots = globSync('playwright/**/m3-*.png', { cwd: temp }).sort();
    const expected = Array.from({ length: 8 }, (_, i) => 'm3-0' + (i + 1) + '-');
    if (
      screenshots.length !== 8 ||
      !expected.every(
        (prefix) =>
          screenshots.filter((file) => path.basename(file).startsWith(prefix)).length === 1,
      )
    ) {
      throw new Error('The successful browser run did not produce all eight evidence images.');
    }
    const output = path.join(root, 'docs/report-evidence/module-3');
    mkdirSync(output, { recursive: true });
    for (const file of screenshots)
      copyFileSync(path.join(temp, file), path.join(output, path.basename(file)));
  }
} finally {
  if (!supplied) rmSync(temp, { recursive: true, force: true });
}
