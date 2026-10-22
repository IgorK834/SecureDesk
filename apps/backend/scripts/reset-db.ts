// CLI wrapper for `npm run db:reset:dev` / `db:reset:test`.
import { resetDatabase } from '../src/server/db/reset';

try {
  const removed = resetDatabase();
  if (removed.length === 0) {
    console.log('db:reset: no database files to remove.');
  } else {
    for (const file of removed) console.log(`db:reset: removed ${file}`);
  }
} catch (error) {
  console.error(`db:reset failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
