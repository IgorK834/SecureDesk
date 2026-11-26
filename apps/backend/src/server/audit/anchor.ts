import { randomUUID } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { MEMORY_DB } from '../db/config';
import type { AppDb } from '../db/connection';
import { auditLog } from '../db/schema';
import { logEvent } from '../security/log-event';
import { physicalPath, privateFilePath } from '../security/private-file';
import { clock } from '../time/clock';
import { AUDIT_HASH_PATTERN } from './chain';

const Anchor = z.strictObject({
  seq: z.int().positive(),
  hash: z.string().regex(AUDIT_HASH_PATTERN),
  writtenAt: z.iso.datetime({ precision: 3 }),
});
type HeadAnchor = z.output<typeof Anchor>;
type AnchorRead = { status: 'MISSING' | 'INVALID' } | { status: 'PRESENT'; anchor: HeadAnchor };

export function assertAuditAnchorConfig(): void {
  const configured = process.env.AUDIT_ANCHOR_PATH?.trim();
  if (configured) privateFilePath(configured, 'AUDIT_ANCHOR_PATH');
}

export function configuredAuditAnchorPath(database: string): string | undefined {
  if (database === MEMORY_DB) return undefined;
  const file = path.resolve(database);
  const configured = process.env.AUDIT_ANCHOR_PATH?.trim();
  return (
    configured || path.join(path.dirname(file), 'audit', path.basename(file) + '.head-anchor.json')
  );
}

export function auditAnchorPath(database: string): string | undefined {
  const configured = configuredAuditAnchorPath(database);
  if (!configured) return undefined;
  const file = path.resolve(database);
  const filename = privateFilePath(configured, 'AUDIT_ANCHOR_PATH');
  if (['', '-wal', '-shm'].some((suffix) => filename === physicalPath(file + suffix))) {
    throw new Error('AUDIT_ANCHOR_PATH must be separate from the database.');
  }
  return filename;
}

function readAnchor(filename: string | undefined): AnchorRead {
  if (!filename) return { status: 'MISSING' };
  const info = lstatSync(filename, { throwIfNoEntry: false });
  if (!info) return { status: 'MISSING' };
  if (!info.isFile() || info.size > 1024) return { status: 'INVALID' };
  try {
    const parsed = Anchor.safeParse(JSON.parse(readFileSync(filename, 'utf8')));
    return parsed.success ? { status: 'PRESENT', anchor: parsed.data } : { status: 'INVALID' };
  } catch {
    return { status: 'INVALID' };
  }
}

export function readAuditAnchor(database: string): AnchorRead {
  try {
    return readAnchor(auditAnchorPath(database));
  } catch {
    return { status: 'INVALID' };
  }
}

function writeAnchor(filename: string, anchor: HeadAnchor): void {
  const directory = path.dirname(filename);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if ((statSync(directory).mode & 0o777) !== 0o700) {
    throw new Error('The audit anchor directory must have mode 0700.');
  }
  const temporary = path.join(directory, '.' + randomUUID() + '.head-anchor.json');
  try {
    writeFileSync(temporary, JSON.stringify(anchor) + '\n', {
      mode: 0o600,
      flag: 'wx',
      flush: true,
    });
    renameSync(temporary, filename);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** Called only after a successful outer commit. SQLite serializes updates across processes. */
export function advanceAuditAnchor(db: AppDb): void {
  if (db.$client.name === MEMORY_DB) return;
  try {
    const filename = auditAnchorPath(db.$client.name)!;
    db.$client
      .transaction(() => {
        const previous = readAnchor(filename);
        if (previous.status === 'INVALID') throw new Error('Malformed audit anchor.');
        if (previous.status === 'PRESENT') {
          const saved = db
            .select({ hash: auditLog.entryHash })
            .from(auditLog)
            .where(eq(auditLog.seq, previous.anchor.seq))
            .get();
          // Preserve evidence when the database no longer agrees with the anchor.
          if (saved?.hash !== previous.anchor.hash) throw new Error('Audit anchor mismatch.');
        }
        const head = db
          .select({ seq: auditLog.seq, hash: auditLog.entryHash })
          .from(auditLog)
          .orderBy(desc(auditLog.seq))
          .limit(1)
          .get();
        if (head && (previous.status !== 'PRESENT' || head.seq > previous.anchor.seq)) {
          writeAnchor(filename, { ...head, writtenAt: clock.now().toISOString() });
        }
      })
      .immediate();
  } catch {
    // The database has already committed. A read can report a stale or missing anchor.
    logEvent('audit.anchor.write_failed', 'system');
  }
}
