import { setImmediate } from 'node:timers/promises';
import { and, asc, desc, eq, gt, lte } from 'drizzle-orm';
import type { AppDb } from '../db/connection';
import { auditLog, type AuditLogRow } from '../db/schema';
import { ApiError } from '../http/errors';
import { readAuditAnchor } from './anchor';
import { AUDIT_HASH_PATTERN, canonicalize, computeEntryHash, GENESIS_HASH } from './chain';
import { sanitizeForLog } from './sanitize';
import type { IntegrityProblem, IntegrityWarning } from './verification-types';

interface VerificationSummary {
  checkedEntries: number;
  headSeq: number | null;
  headHash: string | null;
  durationMs: number;
  warnings: IntegrityWarning[];
}
export type AuditVerification = VerificationSummary &
  (
    | { status: 'INTACT' }
    | { status: 'TAMPERED'; firstProblem: IntegrityProblem; problems: IntegrityProblem[] }
  );

const busy = new Set<string | AppDb['$client']>();
const MAX_PROBLEMS = 20;
const BATCH_SIZE = 1000;
const WORK_SLICE_MS = 12;

function problemId(id: unknown): string | null {
  return typeof id === 'string' ? sanitizeForLog(id, 128) : null;
}

function inspect(
  row: AuditLogRow,
  previousSeq: number,
  previousHash: string,
): IntegrityProblem['kind'] | undefined {
  if (
    !Number.isSafeInteger(row.seq) ||
    row.seq < 1 ||
    typeof row.prevHash !== 'string' ||
    typeof row.entryHash !== 'string' ||
    !AUDIT_HASH_PATTERN.test(row.prevHash) ||
    !AUDIT_HASH_PATTERN.test(row.entryHash)
  )
    return 'MALFORMED_ROW';
  if (row.seq !== previousSeq + 1) return 'SEQUENCE_GAP';
  if (row.prevHash !== previousHash) return previousSeq === 0 ? 'GENESIS_MISMATCH' : 'CHAIN_BROKEN';
  if (computeEntryHash(row.prevHash, canonicalize(row)) !== row.entryHash) return 'HASH_MISMATCH';
}

export async function verifyAuditChain(
  db: AppDb,
  { batchSize = BATCH_SIZE }: { batchSize?: number } = {},
): Promise<AuditVerification> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > BATCH_SIZE) {
    throw new RangeError('Invalid audit verification batch size.');
  }
  const connection = db.$client;
  const key = connection.memory ? connection : connection.name;
  if (busy.has(key)) {
    throw new ApiError(409, 'VERIFICATION_IN_PROGRESS', 'Weryfikacja już trwa');
  }
  busy.add(key);
  try {
    const started = performance.now();
    // Read the file first. Its referenced commit is then visible to the head query.
    const anchor = readAuditAnchor(connection.name);
    const head = db
      .select({ seq: auditLog.seq, hash: auditLog.entryHash })
      .from(auditLog)
      .orderBy(desc(auditLog.seq))
      .limit(1)
      .get();
    const problems: IntegrityProblem[] = [];
    let checkedEntries = 0;
    let cursor: number | null = null;
    let previousSeq = 0;
    let previousHash = GENESIS_HASH;
    const limit = head?.seq ?? 0;
    while (head && (cursor === null || cursor < limit)) {
      let sliceStarted = performance.now();
      const batch = db
        .select()
        .from(auditLog)
        .where(
          and(cursor === null ? undefined : gt(auditLog.seq, cursor), lte(auditLog.seq, limit)),
        )
        .orderBy(asc(auditLog.seq))
        .limit(batchSize)
        .all();
      if (batch.length === 0) {
        if (problems.length < MAX_PROBLEMS)
          problems.push({ seq: previousSeq + 1, id: null, kind: 'SEQUENCE_GAP' });
        break;
      }
      for (const row of batch) {
        if (performance.now() - sliceStarted >= WORK_SLICE_MS) {
          await setImmediate();
          sliceStarted = performance.now();
        }
        const kind = inspect(row, previousSeq, previousHash);
        if (kind && problems.length < MAX_PROBLEMS)
          problems.push({
            seq: Number.isSafeInteger(row.seq) ? row.seq : null,
            id: problemId(row.id),
            kind,
          });
        previousSeq = row.seq;
        previousHash = row.entryHash;
        checkedEntries++;
      }
      cursor = previousSeq;
      if (cursor < limit) await setImmediate();
    }

    let mismatch: IntegrityProblem | undefined;
    if (anchor.status === 'INVALID') mismatch = { seq: null, id: null, kind: 'HEAD_MISMATCH' };
    if (anchor.status === 'PRESENT') {
      const { seq, hash } = anchor.anchor;
      const anchored =
        seq <= limit
          ? db
              .select({ id: auditLog.id, hash: auditLog.entryHash })
              .from(auditLog)
              .where(eq(auditLog.seq, seq))
              .get()
          : undefined;
      if (anchored?.hash !== hash)
        mismatch = { seq, id: problemId(anchored?.id), kind: 'HEAD_MISMATCH' };
    }
    if (mismatch) {
      const { seq } = mismatch;
      const later = problems.findIndex(
        (problem) => seq !== null && problem.seq !== null && problem.seq > seq,
      );
      if (later === -1) problems[Math.min(problems.length, MAX_PROBLEMS - 1)] = mismatch;
      else {
        problems.splice(later, 0, mismatch);
        if (problems.length > MAX_PROBLEMS) problems.pop();
      }
    }
    const summary: VerificationSummary = {
      checkedEntries,
      headSeq: head?.seq ?? null,
      headHash: head?.hash ?? null,
      durationMs: Math.round(performance.now() - started),
      warnings: head && anchor.status === 'MISSING' ? ['ANCHOR_MISSING'] : [],
    };
    const firstProblem = problems[0];
    return firstProblem
      ? { ...summary, status: 'TAMPERED', firstProblem, problems }
      : { ...summary, status: 'INTACT' };
  } finally {
    busy.delete(key);
  }
}
