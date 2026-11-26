import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../../../../../../../tests/helpers/api-client';
import { FakeClock } from '../../../../../../../tests/helpers/fake-clock';
import { appendAuditEntry } from '../../../../server/audit/append';
import { seedWorld, signInAs } from '../../../../server/db/__fixtures__/seeded-world';
import { setUpSharedTestDb } from '../../../../server/db/__fixtures__/shared-test-db';
import { rejectAuditInserts } from '../../../../server/db/__fixtures__/test-db';
import { db } from '../../../../server/db/client';
import { auditLog } from '../../../../server/db/schema';
import * as detail from './[seq]/route';
import * as exportRoute from './export/route';
import * as list from './route';

const URL = '/api/admin/audit-log';
const NOW = new Date('2026-11-26T09:15:00.000Z');
const clock = new FakeClock(NOW);
const FILTER_FIELDS = [
  'seq',
  'id',
  'occurred_at',
  'actor_type',
  'actor_user_id',
  'actor_login',
  'subject_login',
  'subject_ref',
  'ip',
  'action',
  'description',
  'outcome',
  'details',
  'request_id',
] as const;
let ids: Record<string, string>;

setUpSharedTestDb();
beforeEach(() => {
  clock.set(NOW);
  clock.install();
  ids = seedWorld(db);
  vi.stubEnv('AUDIT_EXPORT_MAX_ROWS', undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => {
  clock.uninstall();
  vi.restoreAllMocks();
});

const admin = () => createApiClient().signIn(signInAs(db, ids.ADMIN!));
const rowsFor = (action: string) =>
  db.select().from(auditLog).where(eq(auditLog.action, action)).orderBy(auditLog.seq).all();
type RowInput = Partial<Parameters<typeof appendAuditEntry>[1]>;

function append(input: RowInput = {}, offsetMs = -5_000) {
  return appendAuditEntry(
    db,
    {
      actorType: 'ANONYMOUS',
      action: 'AUTH_LOGIN_FAILURE',
      outcome: 'FAILURE',
      details: { reason: 'BAD_CREDENTIALS' },
      requestId: 'fixture',
      ip: '2001:db8::1',
      ...input,
    },
    { now: () => new Date(NOW.getTime() + offsetMs) },
  );
}

const good = { action: 'AUTH_LOGIN_SUCCESS', outcome: 'SUCCESS', details: {} } as const;
const filter = (query: Record<string, string>) => URL + '?' + new URLSearchParams(query).toString();

describe('audit log read API', () => {
  it('SEC-79 combines user, UTC range, multiple actions and outcome with deterministic paging', async () => {
    const first = append({ subjectLogin: 'employee1' }, -3_000);
    const second = append(
      { ...good, actorType: 'USER', actorUserId: ids.employee1, actorLogin: 'employee1' },
      -3_000,
    );
    const latest = append({ subjectLogin: 'employee1' }, -2_000);
    append({ subjectLogin: 'guest1' }, -2_000);
    append({ subjectLogin: 'employee1' }, -6_000);
    append(
      { action: 'AUTH_LOGOUT', outcome: 'SUCCESS', details: {}, subjectLogin: 'employee1' },
      -2_000,
    );

    const client = admin();
    const query = {
      user: 'employee1',
      from: '2026-11-26T09:14:57Z',
      to: '2026-11-26T09:14:58Z',
      action: 'AUTH_LOGIN_SUCCESS,AUTH_LOGIN_FAILURE',
      pageSize: '2',
    };
    const result = await client.get(list, filter(query));
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    const page = await result.json();
    expect(page).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(page.items.map((row: { seq: number }) => row.seq)).toEqual([latest.seq, second.seq]);
    expect(page.items[1].actor).toEqual({
      type: 'USER',
      userId: ids.employee1,
      login: 'employee1',
    });
    expect(page.actions).toContain('AUTH_LOGIN_FAILURE');
    const following = await client.get(list, filter({ ...query, page: '2' }));
    expect((await following.json()).items.map((row: { seq: number }) => row.seq)).toEqual([
      first.seq,
    ]);
    const outcome = await client.get(list, filter({ ...query, outcome: 'SUCCESS' }));
    expect((await outcome.json()).items.map((row: { seq: number }) => row.seq)).toEqual([
      second.seq,
    ]);

    const byId = await client.get(list, filter({ user: ids.employee1! }));
    expect((await byId.json()).items.map((row: { seq: number }) => row.seq)).toEqual([second.seq]);
    const one = await client.get(detail, URL + '/' + first.seq, {
      params: { seq: String(first.seq) },
    });
    expect(await one.json()).toEqual({
      seq: first.seq,
      id: first.id,
      occurredAt: first.occurredAt,
      actor: { type: 'ANONYMOUS', userId: null, login: null },
      subject: { login: 'employee1', ref: null },
      ip: first.ip,
      action: first.action,
      description: first.description,
      outcome: first.outcome,
      details: { reason: 'BAD_CREDENTIALS' },
      requestId: first.requestId,
      prevHash: first.prevHash,
      entryHash: first.entryHash,
    });
    expect((await client.get(detail, URL + '/900', { params: { seq: '900' } })).status).toBe(404);
    expect((await client.get(detail, URL + '/bad', { params: { seq: 'bad' } })).status).toBe(400);
  });

  it.each(['%', '_', '\\', "'"])('matches the literal user filter %s', async (character) => {
    const literal = append({ actorLogin: 'with' + character + 'literal' });
    append({ subjectLogin: 'unrelated' });
    const response = await admin().get(list, filter({ user: character }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.items[0].seq).toBe(literal.seq);
  });

  const invalidQueries: Record<string, string>[] = [
    { pageSize: '1000' },
    { page: '0' },
    { page: '9007199254740991', pageSize: '100' },
    { from: '2026-11-26T09:16Z', to: '2026-11-26T09:15Z' },
    { from: '2026-11-26T10:15:00+01:00' },
    { action: 'AUTH_LOGOUT,UNKNOWN' },
    { unknown: '1' },
  ];
  it.each(invalidQueries)('rejects invalid or unknown query parameters %j', async (query) => {
    expect((await admin().get(list, filter(query))).status).toBe(400);
    expect(rowsFor('AUDIT_LOG_VIEWED')).toEqual([]);
  });

  it('SEC-81 records one view across both endpoints per session in a rolling five-minute window', async () => {
    const row = append();
    const first = admin();
    const second = admin();
    const view = () => first.get(list, URL);
    expect((await view()).status).toBe(200);
    expect(
      (await first.get(detail, URL + '/' + row.seq, { params: { seq: String(row.seq) } })).status,
    ).toBe(200);
    clock.advance(299_999);
    expect((await view()).status).toBe(200);
    expect(rowsFor('AUDIT_LOG_VIEWED')).toHaveLength(1);
    expect((await second.get(list, URL)).status).toBe(200);
    clock.advance(1);
    expect((await view()).status).toBe(200);
    const views = rowsFor('AUDIT_LOG_VIEWED');
    expect(views).toHaveLength(3);
    expect(views[0]?.details).toBe(views[2]?.details);
    expect(views[1]?.details).not.toBe(views[0]?.details);
  });
});

describe('audit log export API', () => {
  it('SEC-80 and SEC-81 stream exactly the selected rows, include hashes and record the export first', async () => {
    const first = append({ actorLogin: '=HYPERLINK("https://example.test","Label")' }, -4_000);
    append({ ...good }, -3_000);
    const last = append({ actorLogin: 'name, with "quotes"' }, -2_000);
    const filters = { action: ['AUTH_LOGIN_FAILURE'], from: '2026-11-26T09:14:56.000Z' };
    const client = admin();
    const jsonl = await client.post(exportRoute, URL + '/export', {
      json: { ...filters, format: 'jsonl' },
    });

    expect(jsonl.status).toBe(200);
    expect(jsonl.headers.get('cache-control')).toBe('no-store');
    expect(jsonl.headers.get('x-content-type-options')).toBe('nosniff');
    expect(jsonl.headers.get('content-disposition')).toBe(
      'attachment; filename="audit-log-2026-11-26T09-15-00.000Z.jsonl"',
    );
    expect(jsonl.headers.get('content-type')).toContain('application/x-ndjson');
    const [exported] = rowsFor('AUDIT_LOG_EXPORTED');
    expect(JSON.parse(exported!.details)).toEqual({
      filters,
      format: 'jsonl',
      rowCount: 2,
      firstSeq: first.seq,
      lastSeq: last.seq,
    });
    append({ subjectLogin: 'will-not-enter-this-stream' }, -1_000);
    const entries = (await jsonl.text())
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(entries.map((entry) => [entry.seq, entry.prev_hash, entry.entry_hash])).toEqual(
      [first, last].map((row) => [row.seq, row.prevHash, row.entryHash]),
    );

    const csv = await client.post(exportRoute, URL + '/export', {
      json: {
        ...filters,
        to: '2026-11-26T09:14:58.000Z',
        format: 'csv',
      },
    });
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    const [header, line1, line2, final] = (await csv.text()).split('\r\n');
    expect(header).toBe([...FILTER_FIELDS, 'prev_hash', 'entry_hash'].join(','));
    expect(line1?.startsWith(first.seq + ',')).toBe(true);
    expect(line1).toContain('"' + "'=HYPERLINK(" + '""https://example.test"",""Label"")"');
    expect(line1).toContain(first.prevHash + ',' + first.entryHash);
    expect(line2?.startsWith(last.seq + ',')).toBe(true);
    expect(line2).toContain('"name, with ""quotes"""');
    expect(line2).toContain(last.prevHash + ',' + last.entryHash);
    expect(final).toBe('');
  });

  it('recomputes the stored chain independently from a multi-batch JSON Lines export', async () => {
    for (let i = 0; i < 510; i++) append();
    const response = await admin().post(exportRoute, URL + '/export', {
      json: { format: 'jsonl' },
    });
    expect(response.status).toBe(200);
    const rows = (await response.text())
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(rows).toHaveLength(510);
    let previous = '0'.repeat(64);
    for (const [index, row] of rows.entries()) {
      const content = JSON.stringify(['sd-audit-v1', ...FILTER_FIELDS.map((field) => row[field])]);
      const recomputed = createHash('sha256')
        .update(previous + '\n' + content, 'utf8')
        .digest('hex');
      expect(row.seq).toBe(index + 1);
      expect(row.prev_hash).toBe(previous);
      expect(row.entry_hash).toBe(recomputed);
      previous = recomputed;
    }
  });

  it('returns an empty, audited export when nothing matches', async () => {
    const response = await admin().post(exportRoute, URL + '/export', {
      json: {
        format: 'csv',
        user: 'no-match',
      },
    });
    expect(response.status).toBe(200);
    expect((await response.text()).split('\r\n')).toEqual([
      [...FILTER_FIELDS, 'prev_hash', 'entry_hash'].join(','),
      '',
    ]);
    expect(JSON.parse(rowsFor('AUDIT_LOG_EXPORTED')[0]!.details)).toMatchObject({
      rowCount: 0,
      firstSeq: null,
      lastSeq: null,
    });
  });

  it('enforces the cap and emits no attachment when audit persistence fails', async () => {
    append();
    append();
    vi.stubEnv('AUDIT_EXPORT_MAX_ROWS', '1');
    const client = admin();
    const tooLarge = await client.post(exportRoute, URL + '/export', { json: { format: 'csv' } });
    expect(tooLarge.status).toBe(400);
    expect(await tooLarge.json()).toMatchObject({ error: { code: 'EXPORT_TOO_LARGE' } });
    expect(rowsFor('AUDIT_LOG_EXPORTED')).toEqual([]);

    vi.stubEnv('AUDIT_EXPORT_MAX_ROWS', '2');
    rejectAuditInserts(db);
    const failed = await client.post(exportRoute, URL + '/export', { json: { format: 'csv' } });
    expect(failed.status).toBe(500);
    expect(failed.headers.has('content-disposition')).toBe(false);
    expect(await failed.json()).toMatchObject({ error: { code: 'AUDIT_UNAVAILABLE' } });
    expect(rowsFor('AUDIT_LOG_EXPORTED')).toEqual([]);
  });

  it('rejects forged CSRF tokens, pagination in exports and invalid export configuration', async () => {
    const client = admin();
    const forged = await client.post(exportRoute, URL + '/export', {
      json: { format: 'csv' },
      headers: { 'x-xsrf-token': 'wrong' },
    });
    expect(forged.status).toBe(403);
    const pagination = await client.post(exportRoute, URL + '/export', {
      json: { format: 'csv', page: 2 },
    });
    expect(pagination.status).toBe(400);
    vi.stubEnv('AUDIT_EXPORT_MAX_ROWS', 'invalid');
    expect(
      (await client.post(exportRoute, URL + '/export', { json: { format: 'csv' } })).status,
    ).toBe(500);
    expect(rowsFor('AUDIT_LOG_EXPORTED')).toEqual([]);
  });
});
