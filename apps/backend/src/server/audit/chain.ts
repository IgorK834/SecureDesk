import { createHash } from 'node:crypto';
import type { AuditLogRow } from '../db/schema/audit-log';

export const GENESIS_HASH = '0'.repeat(64);

export type AuditEntryContent = Omit<AuditLogRow, 'prevHash' | 'entryHash' | 'details'> & {
  details: string | null;
};

/** Only JSON data from the validated details schema enters this serializer. */
export function canonicalDetails(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalDetails).join(',')}]`;
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  const object = value as Record<string, unknown>;
  const fields = Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalDetails(object[key])}`);
  return `{${fields.join(',')}}`;
}

/** The details field is the canonical JSON text stored in the database. */
export function canonicalize(entry: AuditEntryContent): string {
  return JSON.stringify([
    'sd-audit-v1',
    entry.seq,
    entry.id,
    entry.occurredAt,
    entry.actorType,
    entry.actorUserId,
    entry.actorLogin,
    entry.subjectLogin,
    entry.subjectRef,
    entry.ip,
    entry.action,
    entry.description,
    entry.outcome,
    entry.details,
    entry.requestId,
  ]);
}

export function computeEntryHash(prevHash: string, canonical: string): string {
  return createHash('sha256').update(`${prevHash}\n${canonical}`, 'utf8').digest('hex');
}
