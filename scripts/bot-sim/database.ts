import Database from 'better-sqlite3';

export interface ScenarioStore {
  reset(): void;
  eventTypes(): string[];
  close(): void;
}

export class SqliteScenarioStore implements ScenarioStore {
  private readonly database: Database.Database;

  constructor(databasePath: string) {
    this.database = new Database(databasePath);
    this.database.pragma('busy_timeout = 5000');
  }

  reset(): void {
    this.database.transaction(() => {
      this.database.prepare('DELETE FROM captcha_challenges').run();
      this.database.prepare('DELETE FROM login_attempts').run();
      this.database.prepare('DELETE FROM security_events').run();
      this.database
        .prepare('UPDATE honeytokens SET last_triggered_at = NULL, trigger_count = 0')
        .run();
    })();
  }

  eventTypes(): string[] {
    return (
      this.database
        .prepare('SELECT type FROM security_events ORDER BY occurred_at, rowid')
        .all() as { type: string }[]
    ).map(({ type }) => type);
  }

  close(): void {
    this.database.close();
  }
}
