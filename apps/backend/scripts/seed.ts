// CLI wrapper for `npm run db:seed` / `db:seed:test`. Modules are imported lazily so that a bad
// database configuration is reported as a readable message instead of an import-time stack trace.
import path from 'node:path';

async function main(): Promise<void> {
  try {
    const { db } = await import('../src/server/db/client');
    const { seedDatabase } = await import('../src/server/db/seeds');
    const { INITIAL_CREDENTIALS_FILE, appendInitialCredentials, prepareCredentialsDir } =
      await import('../src/server/db/seeds/credentials-file');
    const { clock } = await import('../src/server/time/clock');

    // Opening the connection first makes a bad database configuration fail before anything
    // else (such as creating the credentials directory) happens.
    const databaseFile = db.$client.name;

    // Test runs read the passwords from seedDatabase()'s return value; nothing is written to disk.
    const persist = process.env.NODE_ENV !== 'test';
    const file = path.resolve(INITIAL_CREDENTIALS_FILE);
    if (persist) prepareCredentialsDir(file);

    const { created, skipped } = await seedDatabase(db);
    db.$client.close();

    if (created.length === 0) {
      console.log(`db:seed OK - nothing to create, all ${skipped.length} seed accounts exist.`);
    } else if (persist) {
      appendInitialCredentials(file, created, clock.now());
      console.log(
        `db:seed OK - created ${created.length} account(s), ${skipped.length} already existed: ${databaseFile}`,
      );
      console.log(`Initial credentials (owner-only, not shown here): ${file}`);
    } else {
      console.log(
        `db:seed OK (NODE_ENV=test) - created ${created.length} account(s), ${skipped.length} already existed: ${databaseFile}`,
      );
      console.log('Passwords are not persisted in test mode; seedDatabase() returns them.');
    }
  } catch (error) {
    console.error(`db:seed failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

void main();
