import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { SecuritySettingsPatch } from '../apps/backend/src/server/security/schemas';
import { loadRoutes, type ExportedHandler } from './helpers/route-scanner';

const ROOT = path.resolve(import.meta.dirname, '..');
const API_ROOT = path.join(ROOT, 'apps/backend/src/app/api');
const REVIEWED_AUDIT_ENV = new Set([
  'AUDIT_ANCHOR_PATH',
  'AUDIT_EXPORT_MAX_ROWS',
  'AUDIT_SUBJECT_PEPPER',
  'AUDIT_VERIFY_INTERVAL_MINUTES',
]);

function auditMutationRoutes(routes: ExportedHandler[]): string[] {
  return routes
    .filter(
      ({ route, method }) =>
        route.split('/').includes('audit-log') && ['PATCH', 'PUT', 'DELETE'].includes(method),
    )
    .map(({ method, route }) => method + ' ' + route);
}

function auditEnvControls(source: string): string[] {
  return Array.from(
    source.matchAll(/^\s*#?\s*(?:export\s+)?([\w-]+)\s*=/gm),
    ([, key]) => key!,
  ).filter((key) => /audit/i.test(key) && !REVIEWED_AUDIT_ENV.has(key));
}

function auditSchemaKeys(source: string): string[] {
  const ast = ts.createSourceFile('schema.ts', source, ts.ScriptTarget.Latest, true);
  const keys = new Set<string>();
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) || ts.isStringLiteral(node)) {
      if (/^[a-z][\w-]*$/i.test(node.text) && /audit/i.test(node.text)) keys.add(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return [...keys].sort();
}

describe('SEC-77 audit log application protections', () => {
  it('finds the real audit routes and rejects mutation handlers under every audit-log segment', async () => {
    const routes = await loadRoutes(API_ROOT);
    expect(routes).toContainEqual(
      expect.objectContaining({
        route: '/api/admin/audit-log',
        method: 'GET',
      }),
    );
    expect(auditMutationRoutes(routes)).toEqual([]);
  });

  it('flags newly added mutation exports, including a renamed export on a nested audit route', async () => {
    const fixture = mkdtempSync(path.join(tmpdir(), 'securedesk-audit-routes-'));
    try {
      const route = path.join(fixture, 'admin', 'audit-log', '[seq]');
      mkdirSync(route, { recursive: true });
      writeFileSync(
        path.join(route, 'route.ts'),
        `
        export const PATCH = () => new Response();
        export function PUT() { return new Response(); }
        const remove = () => new Response();
        export { remove as DELETE };
      `,
      );
      expect(auditMutationRoutes(await loadRoutes(fixture))).toEqual([
        'PUT /api/admin/audit-log/[seq]',
        'PATCH /api/admin/audit-log/[seq]',
        'DELETE /api/admin/audit-log/[seq]',
      ]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('permits only the reviewed audit environment keys and no audit settings or columns', () => {
    expect(auditEnvControls(readFileSync(path.join(ROOT, '.env.example'), 'utf8'))).toEqual([]);
    for (const file of ['security/schemas.ts', 'db/schema/security-settings.ts']) {
      expect(
        auditSchemaKeys(readFileSync(path.join(ROOT, 'apps/backend/src/server', file), 'utf8')),
        file,
      ).toEqual([]);
    }
  });

  it.each(['AUDIT_ENABLED', 'DISABLE_AUDIT', 'AUDIT_LEVEL', 'auditLoggingEnabled'])(
    'detects the added control %s and rejects it in a security settings patch',
    (key) => {
      expect(auditEnvControls('# ' + key + '=false')).toContain(key);
      expect(auditSchemaKeys('const settings = { "' + key + '": text("' + key + '") }')).toContain(
        key,
      );
      expect(SecuritySettingsPatch.safeParse({ minPasswordLength: 14, [key]: false }).success).toBe(
        false,
      );
    },
  );
});
