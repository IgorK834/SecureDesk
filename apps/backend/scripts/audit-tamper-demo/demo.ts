import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { auditAnchorPath } from '../../src/server/audit/anchor';
import { appendAuditEntry } from '../../src/server/audit/append';
import { type AuditVerification, verifyAuditChain } from '../../src/server/audit/verify';
import { resolveDbPath } from '../../src/server/db/config';
import { type AppDb, createDb } from '../../src/server/db/connection';
import { runMigrations } from '../../src/server/db/migrate';
import { type AuditLogRow, auditLog } from '../../src/server/db/schema';

function demoSource(env: NodeJS.ProcessEnv): string {
  if (env.NODE_ENV === 'production')
    throw new Error('The audit demo is unavailable in production.');
  const filename = resolveDbPath(env, 'E2E_DATABASE_PATH');
  const source = statSync(filename, { throwIfNoEntry: false });
  if (!source?.isFile()) throw new Error('E2E_DATABASE_PATH must name an existing SQLite file.');
  for (const variable of ['DATABASE_PATH', 'TEST_DATABASE_PATH'] as const) {
    const configured = env[variable]?.trim();
    if (!configured) continue;
    const other = statSync(path.resolve(configured), { throwIfNoEntry: false });
    if (other?.dev === source.dev && other.ino === source.ino) {
      throw new Error('E2E_DATABASE_PATH must not alias ' + variable + '.');
    }
  }
  return filename;
}

type Output = (line: string) => void;
const appendOnly = 'audit_log is append-only';

function appendExample(
  db: Parameters<typeof appendAuditEntry>[0],
  sample: number,
  alternate = false,
) {
  return appendAuditEntry(db, {
    actorType: 'SYSTEM',
    action: 'AUTH_LOGIN_FAILURE',
    outcome: 'FAILURE',
    details: { reason: alternate ? 'ACCOUNT_LOCKED' : 'BAD_CREDENTIALS' },
    requestId: 'audit-demo-' + sample,
  });
}

/** These probes target one synthetic row on the private backup. */
function demonstrateTriggers(db: AppDb, print: Output): void {
  db.transaction((tx) => {
    const { seq } = appendExample(tx, 0);
    for (const [name, sql] of [
      ['UPDATE', 'UPDATE audit_log SET description = description WHERE seq = ?'],
      ['DELETE', 'DELETE FROM audit_log WHERE seq = ?'],
    ] as const) {
      try {
        db.$client.prepare(sql).run(seq);
      } catch (error) {
        if (error instanceof Error && error.message === appendOnly) {
          print(name + ' blocked: ' + appendOnly);
          continue;
        }
        throw error;
      }
      throw new Error(
        name + ' succeeded on the E2E backup. Check that its audit triggers are installed.',
      );
    }
  });
}

function printResult(print: Output, label: string, result: AuditVerification): void {
  const details =
    result.status === 'TAMPERED'
      ? ' seq=' + result.firstProblem.seq + ' ' + result.firstProblem.kind
      : ' checked=' + result.checkedEntries;
  const warnings = result.warnings.length ? ' ' + result.warnings.join(' ') : '';
  print(label + ': ' + result.status + details + warnings);
}

async function createFixture(filename: string, alternate = false) {
  const db = createDb(filename);
  try {
    runMigrations(db);
    const rows = [1, 2, 3].map((seq) => appendExample(db, seq, alternate && seq === 1));
    return {
      rows,
      anchor: readFileSync(auditAnchorPath(filename)!),
      result: await verifyAuditChain(db),
    };
  } finally {
    db.$client.close();
  }
}

/** Import known synthetic history through INSERTs. The append-only triggers stay installed. */
async function verifyFixture(filename: string, rows: AuditLogRow[], witness?: Buffer) {
  const db = createDb(filename);
  try {
    runMigrations(db);
    db.insert(auditLog).values(rows).run();
    if (witness) {
      const destination = auditAnchorPath(filename)!;
      mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      writeFileSync(destination, witness, { mode: 0o600, flag: 'wx' });
    }
    return await verifyAuditChain(db);
  } finally {
    db.$client.close();
  }
}

export async function runAuditTamperDemo(env: NodeJS.ProcessEnv, print: Output): Promise<void> {
  const source = demoSource(env);
  const scratch = mkdtempSync(path.join(tmpdir(), 'securedesk-audit-demo-'));
  const previousAnchor = process.env.AUDIT_ANCHOR_PATH;
  // Each generated file uses an anchor local to this private directory.
  process.env.AUDIT_ANCHOR_PATH = '';
  try {
    const copy = path.join(scratch, 'e2e-backup.sqlite');
    const reader = new Database(source, { readonly: true, fileMustExist: true });
    try {
      await reader.backup(copy);
      chmodSync(copy, 0o600);
    } finally {
      reader.close();
    }
    const db = createDb(copy);
    try {
      demonstrateTriggers(db, print);
    } finally {
      db.$client.close();
    }

    const baseline = await createFixture(path.join(scratch, 'baseline.sqlite'));
    const { rows, anchor } = baseline;
    const name = (file: string) => path.join(scratch, file + '.sqlite');

    printResult(print, '1 Changed field before', baseline.result);
    const changed = rows.map((row) =>
      row.seq === 2 ? { ...row, description: 'Synthetic edit' } : row,
    );
    printResult(
      print,
      '1 Changed field after',
      await verifyFixture(name('changed'), changed, anchor),
    );

    printResult(print, '2 Middle entry before', baseline.result);
    const middle = rows.filter((row) => row.seq !== 2);
    printResult(print, '2 Middle entry after', await verifyFixture(name('middle'), middle, anchor));

    printResult(print, '3 Tail before', baseline.result);
    const tail = rows.slice(0, -1);
    printResult(
      print,
      '3 Tail after, chain only',
      await verifyFixture(name('trimmed-chain'), tail),
    );
    printResult(
      print,
      '3 Tail after, original anchor',
      await verifyFixture(name('trimmed-anchored'), tail, anchor),
    );

    printResult(print, '4 Alternate synthetic history before', baseline.result);
    const alternate = await createFixture(name('alternate'), true);
    printResult(
      print,
      '4 Alternate history after, chain only',
      await verifyFixture(name('alternate-chain'), alternate.rows),
    );
    printResult(
      print,
      '4 Alternate history after, original anchor',
      await verifyFixture(name('alternate-witness'), alternate.rows, anchor),
    );
    printResult(print, '4 Alternate history after, paired local anchor', alternate.result);
    print(
      'An off-host copy of the original anchor can distinguish the two internally valid histories.',
    );
  } finally {
    if (previousAnchor === undefined) delete process.env.AUDIT_ANCHOR_PATH;
    else process.env.AUDIT_ANCHOR_PATH = previousAnchor;
    rmSync(scratch, { recursive: true, force: true });
  }
}
