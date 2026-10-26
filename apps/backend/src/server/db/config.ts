import path from 'node:path';

export const MEMORY_DB = ':memory:';

/** Thrown for any unsafe or missing database configuration. The message is safe to print. */
export class DbConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DbConfigError';
  }
}

function pathsOverlap(segments: string[], wanted: string[]): boolean {
  return segments.some((_, start) => wanted.every((part, i) => segments[start + i] === part));
}

/**
 * Resolves the SQLite file for the current environment (TEST_DATABASE_PATH for unit tests,
 * E2E_DATABASE_PATH for browser tests, DATABASE_PATH otherwise) and refuses unsafe setups. Relative paths are
 * resolved against the current working directory (apps/backend for every npm script).
 */
export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const isTest = env.NODE_ENV === 'test';
  const isE2e = Boolean(env.E2E_DATABASE_PATH?.trim()) && !isTest;
  const variable = isTest ? 'TEST_DATABASE_PATH' : isE2e ? 'E2E_DATABASE_PATH' : 'DATABASE_PATH';
  const raw = env[variable]?.trim();

  if (!raw) {
    throw new DbConfigError(
      `${variable} is not set. Copy .env.example to .env (or export ${variable}) before using the database.`,
    );
  }

  if (raw === MEMORY_DB) {
    if (!isTest) {
      throw new DbConfigError(
        `${variable}=:memory: is only allowed when NODE_ENV=test; use a file path under data/.`,
      );
    }
    return MEMORY_DB;
  }

  const resolved = path.resolve(raw);

  const otherVariables = ['DATABASE_PATH', 'TEST_DATABASE_PATH', 'E2E_DATABASE_PATH'].filter(
    (candidate) => candidate !== variable,
  );
  const overlap = otherVariables.find((candidate) => {
    const other = env[candidate]?.trim();
    return other && other !== MEMORY_DB && path.resolve(other) === resolved;
  });
  if (overlap) {
    throw new DbConfigError(
      `${variable} and ${overlap} must be different files (both resolve to ${resolved}); tests would destroy another environment's data.`,
    );
  }

  const segments = resolved.split(path.sep);
  if (segments.includes('public')) {
    throw new DbConfigError(
      `${variable} (${resolved}) is inside a public/ directory, which web servers can serve. Use a path under data/.`,
    );
  }
  if (pathsOverlap(segments, ['apps', 'frontend'])) {
    throw new DbConfigError(
      `${variable} (${resolved}) is inside apps/frontend, which the frontend dev server can serve. Use a path under data/.`,
    );
  }

  return resolved;
}
