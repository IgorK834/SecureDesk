// CLI wrapper for `npm run db:reset:dev` / `db:reset:test`: `reset-db.ts <dev|test>`.
import { RESET_TARGETS, resetDatabase } from '../src/server/db/reset';

try {
  const target = RESET_TARGETS.find((candidate) => candidate === process.argv[2]);
  if (!target) throw new Error(`Usage: reset-db.ts <${RESET_TARGETS.join('|')}>`);

  const removed = resetDatabase(target);
  if (removed.length === 0) {
    console.log('db:reset: no database files to remove.');
  } else {
    for (const file of removed) console.log(`db:reset: removed ${file}`);
  }
} catch (error) {
  console.error(`db:reset failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
