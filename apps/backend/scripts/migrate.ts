// CLI wrapper for `npm run db:migrate`. Modules are imported lazily so that a bad database
// configuration is reported as a readable message instead of an import-time stack trace.
async function main(): Promise<void> {
  try {
    const { db } = await import('../src/server/db/client');
    const { runMigrations } = await import('../src/server/db/migrate');
    const file = db.$client.name;
    runMigrations(db);
    db.$client.close();
    console.log(`db:migrate OK - database is up to date: ${file}`);
  } catch (error) {
    console.error(`db:migrate failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

void main();
