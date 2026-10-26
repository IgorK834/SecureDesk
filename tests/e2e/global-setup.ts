import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default function globalSetup(): void {
  execFileSync(path.resolve('node_modules/.bin/tsx'), ['tests/e2e/setup-db.ts'], {
    cwd: path.resolve('.'),
    stdio: 'inherit',
  });
}
