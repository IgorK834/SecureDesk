import { lokiPushEndpoint, shipAuditToLoki } from '../src/server/audit/ship-loki';
import { resolveDbPath } from '../src/server/db/config';
import { createDb } from '../src/server/db/connection';

async function main(): Promise<void> {
  if (!lokiPushEndpoint()) {
    console.log('Loki shipping is disabled.');
    return;
  }
  const db = createDb(resolveDbPath());
  try {
    const result = await shipAuditToLoki(db);
    console.log(JSON.stringify(result));
    process.exitCode = result.status === 'complete' ? 0 : 1;
  } finally {
    db.$client.close();
  }
}

main().catch(() => {
  console.error('audit:ship failed to complete delivery.');
  process.exitCode = 1;
});
