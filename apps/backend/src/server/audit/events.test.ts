import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createMigratedDb } from '../db/__fixtures__/test-db';
import { auditLog } from '../db/schema';
import { appendAuditEntry } from './append';
import { validateAuditEvent } from './events';
import { sanitizeForLog } from './sanitize';
import { subjectFor } from './subject';

describe('audit event catalogue', () => {
  it.each(['UNDECLARED_ACTION', 'constructor', '__proto__'])(
    'rejects undeclared action %s',
    (action) => {
      expect(() => validateAuditEvent(action, 'SUCCESS', {})).toThrow('Undeclared audit action');
    },
  );

  it('rejects the wrong outcome, reason and extra keys', () => {
    expect(() => validateAuditEvent('AUTH_LOGIN_FAILURE', 'SUCCESS', {})).toThrow('Outcome');
    for (const details of [
      {},
      { reason: 'WRONG' },
      { reason: 'BAD_CREDENTIALS', extra: true },
      { reason: 'BAD_CREDENTIALS', extra: { note: 'unknown' } },
    ]) {
      expect(() => validateAuditEvent('AUTH_LOGIN_FAILURE', 'FAILURE', details)).toThrow('schema');
    }
  });

  it.each(['password', 'nestedToken', 'clientSecret', 'myAnswer', 'CAPTCHA'])(
    'refuses credential-like key %s even deep inside arrays or objects',
    (key) => {
      const details = {
        filter: [[{ nested: { a: { b: { c: { d: { e: { [key]: 'value' } } } } } } }]],
      };
      expect(() => validateAuditEvent('AUDIT_LOG_EXPORTED', 'SUCCESS', details)).toThrow(
        'credential-like key',
      );
    },
  );

  it('validates role transitions, settings types, nested keys and export action filters', () => {
    expect(
      validateAuditEvent('USER_ROLE_CHANGED', 'SUCCESS', {
        from: 'guest',
        to: 'employee',
      }).details,
    ).toEqual({ from: 'guest', to: 'employee' });
    expect(() =>
      validateAuditEvent('SETTINGS_CHANGED', 'SUCCESS', {
        changes: [{ key: 'maxFailedLoginAttempts', from: 5, to: true }],
      }),
    ).toThrow('schema');
    expect(() =>
      validateAuditEvent('SETTINGS_CHANGED', 'SUCCESS', {
        changes: [{ key: 'maxFailedLoginAttempts', from: 5, to: 6, extra: true }],
      }),
    ).toThrow('schema');
    const exported = {
      format: 'jsonl',
      rowCount: 0,
      firstSeq: null,
      lastSeq: null,
      filters: { action: ['AUTH_LOGOUT'] },
    };
    expect(validateAuditEvent('AUDIT_LOG_EXPORTED', 'SUCCESS', exported).details).toEqual(exported);
    expect(() =>
      validateAuditEvent('AUDIT_LOG_EXPORTED', 'SUCCESS', {
        ...exported,
        filters: { action: ['UNKNOWN'] },
      }),
    ).toThrow('schema');
  });

  it('does not store a row if its details contain a password key', () => {
    const db = createMigratedDb();
    try {
      expect(() =>
        appendAuditEntry(db, {
          action: 'AUTH_LOGIN_FAILURE',
          outcome: 'FAILURE',
          actorType: 'ANONYMOUS',
          requestId: 'test',
          details: { reason: 'BAD_CREDENTIALS', password: 'bad' },
        }),
      ).toThrow('credential-like key');
      expect(db.select().from(auditLog).all()).toEqual([]);
    } finally {
      db.$client.close();
    }
  });
});

describe('audit text safety', () => {
  it('escapes controls and zero-width characters before bounding output', () => {
    const controls = [
      0, 9, 10, 13, 31, 127, 133, 159, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029,
      0x202a, 0x202e, 0x2060, 0x2066, 0x2069, 0xfeff,
    ];
    expect(sanitizeForLog(String.fromCodePoint(...controls), 200)).toBe(
      controls.map((code) => '\\u' + code.toString(16).padStart(4, '0')).join(''),
    );
    expect(sanitizeForLog('a\nb', 7)).toBe('a\\u000a');
    expect(sanitizeForLog('a\nb', 6)).toBe('a');
    expect(sanitizeForLog('a😀b', 2)).toBe('a');
    expect(sanitizeForLog('a😀b', 4)).toBe('a😀b');
    expect(sanitizeForLog('a', 0)).toBe('');
  });

  it('escapes actor, subject and details text before serializing without affecting the description', () => {
    const db = createMigratedDb();
    try {
      appendAuditEntry(db, {
        action: 'ACCESS_DENIED',
        outcome: 'FAILURE',
        actorType: 'USER',
        requestId: 'abc\n123',
        actorLogin: 'admin\r\n\u202e',
        subjectLogin: 'known\u200d',
        details: { reason: 'PERMISSION', route: 'admin.users\nspoof' },
      });
      expect(db.select().from(auditLog).get()).toMatchObject({
        actorLogin: 'admin\\u000d\\u000a\\u202e',
        subjectLogin: 'known\\u200d',
        requestId: 'abc\\u000a123',
        description: 'Access denied.',
        details: JSON.stringify({ reason: 'PERMISSION', route: 'admin.users\\u000aspoof' }),
      });
    } finally {
      db.$client.close();
    }
  });

  it('uses keyed HMAC references for unknown subjects and preserves known and trap logins', () => {
    const env = {
      NODE_ENV: 'production',
      AUDIT_SUBJECT_PEPPER: 'synthetic-audit-key-for-subject-tests',
    } as const;
    const login = 'input-that-should-never-be-stored';
    const expected = createHmac('sha256', env.AUDIT_SUBJECT_PEPPER)
      .update(login)
      .digest('hex')
      .slice(0, 16);

    expect(subjectFor(login, false, env)).toEqual({ subjectRef: `ref:${expected}` });
    expect(
      subjectFor(login, false, { ...env, AUDIT_SUBJECT_PEPPER: 'different-synthetic-value' }),
    ).not.toEqual(subjectFor(login, false, env));
    expect(subjectFor('known-account', true, env)).toEqual({ subjectLogin: 'known-account' });
    expect(subjectFor('backup_admin', false, env)).toEqual({ subjectLogin: 'backup_admin' });
    expect(subjectFor(login, false, { NODE_ENV: 'test' })).toEqual(
      subjectFor(login, false, { NODE_ENV: 'test' }),
    );
  });
});
