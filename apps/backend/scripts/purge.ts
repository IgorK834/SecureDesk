// CLI wrapper for `npm run maintenance:purge`. Modules are imported lazily so that a bad database
// configuration is reported as a readable message instead of an import-time stack trace.
async function purgeMain(): Promise<void> {
  try {
    const { db } = await import('../src/server/db/client');
    const { purgeExpired } = await import('../src/server/maintenance/purge');
    const file = db.$client.name;
    const removed = purgeExpired(db);
    db.$client.close();
    console.log(
      `maintenance:purge OK - removed ${removed.loginAttempts} login attempts, ` +
        `${removed.captchaChallenges} CAPTCHA challenges, ${removed.securityEvents} security events: ${file}`,
    );
  } catch (error) {
    console.error(
      `maintenance:purge failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

void purgeMain();
