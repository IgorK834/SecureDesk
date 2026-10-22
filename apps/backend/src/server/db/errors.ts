/**
 * Typed, client-safe database errors. Their messages are fixed strings: SQL text, table
 * names and driver messages never reach API clients.
 */
export class ConflictError extends Error {
  constructor() {
    super('Resource already exists');
    this.name = 'ConflictError';
  }
}

// Named as specified by the backlog. Inside a module that imports it, this shadows the
// JavaScript global ReferenceError, so import it by an alias if both are needed.
export class ReferenceError extends Error {
  constructor() {
    super('Referenced resource does not exist');
    this.name = 'ReferenceError';
  }
}

const MAX_CAUSE_DEPTH = 5;

/**
 * Drizzle wraps driver errors in a DrizzleError (whose message contains the raw SQL) and
 * keeps the SQLite error as `cause`, so the code must be searched along the cause chain.
 */
function findSqliteCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (typeof current !== 'object' || current === null) return undefined;
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === 'string' && code.startsWith('SQLITE_')) return code;
    current = cause;
  }
  return undefined;
}

/**
 * Translates known constraint violations into typed errors. Anything else is returned
 * unchanged: callers must treat it as an internal error and never serialize it to clients.
 */
export function mapDbError(error: unknown): unknown {
  switch (findSqliteCode(error)) {
    case 'SQLITE_CONSTRAINT_UNIQUE':
    // Composite-key join tables (e.g. role/permission links) report duplicates as PRIMARYKEY.
    case 'SQLITE_CONSTRAINT_PRIMARYKEY':
      return new ConflictError();
    case 'SQLITE_CONSTRAINT_FOREIGNKEY':
      return new ReferenceError();
    default:
      return error;
  }
}
