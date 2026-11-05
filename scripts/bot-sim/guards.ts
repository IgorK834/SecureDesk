import { existsSync, lstatSync, statSync } from 'node:fs';
import path from 'node:path';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export interface TargetConsent {
  allowHost?: string;
  ownershipConfirmed?: string;
}

export function isLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return LOCAL_HOSTS.has(normalized) || normalized.endsWith('.localhost');
}

export function validateTarget(raw: string, consent: TargetConsent = {}): URL {
  const target = new URL(raw);
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('The bot simulator target must use HTTP or HTTPS.');
  }
  if (
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== '/'
  ) {
    throw new Error(
      'The bot simulator target must be an origin without credentials, path or query.',
    );
  }

  if (!isLocalHost(target.hostname)) {
    const allowed = consent.allowHost?.toLowerCase().replace(/\.$/, '');
    const actual = target.hostname.toLowerCase().replace(/\.$/, '');
    if (allowed !== actual || consent.ownershipConfirmed !== '1') {
      throw new Error(
        `Refusing non-local target ${target.hostname}. Pass --allow-host ${target.hostname} and set BOTSIM_I_OWN_THE_TARGET=1 only for a system you own.`,
      );
    }
  }
  return new URL(target.origin);
}

export function validateE2eDatabase(
  raw: string,
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (raw.trim() === ':memory:') throw new Error('The bot simulator needs an E2E SQLite file.');
  const resolved = path.resolve(cwd, raw);
  const basename = path.basename(resolved).toLowerCase();
  if (!basename.includes('.e2e.')) {
    throw new Error(`Refusing database without an .e2e. marker: ${resolved}`);
  }
  if (existsSync(resolved) && lstatSync(resolved).isSymbolicLink()) {
    throw new Error(`Refusing a symbolic-link E2E database: ${resolved}`);
  }
  if (existsSync(resolved)) {
    const selected = statSync(resolved);
    for (const variable of ['DATABASE_PATH', 'TEST_DATABASE_PATH']) {
      const other = env[variable]?.trim();
      if (!other || other === ':memory:') continue;
      const candidate = path.resolve(cwd, other);
      if (!existsSync(candidate)) continue;
      const compared = statSync(candidate);
      if (selected.dev === compared.dev && selected.ino === compared.ino) {
        throw new Error(`Refusing E2E database because it is also configured as ${variable}.`);
      }
    }
  }
  return resolved;
}
