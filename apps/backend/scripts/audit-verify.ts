import { runAuditVerification } from '../src/server/audit/scheduled-verification';
import { createDb } from '../src/server/db/connection';
import { resolveDbPath } from '../src/server/db/config';
import { flushPendingAlerts } from '../src/server/security/events';

async function main(): Promise<void> {
  const db = createDb(resolveDbPath());
  try {
    const report = await runAuditVerification(db);
    await flushPendingAlerts();
    console.log(JSON.stringify(report));
    process.exitCode = report?.status === 'INTACT' ? 0 : 1;
  } finally {
    db.$client.close();
  }
}

main().catch(() => {
  console.error('audit:verify failed to complete verification.');
  process.exitCode = 1;
});
