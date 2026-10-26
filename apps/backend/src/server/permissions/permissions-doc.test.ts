import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, type RoleId } from './codes';
import { ROLE_PERMISSIONS } from './matrix';

// docs/permissions.md is the matrix as it goes into the report. It repeats what matrix.ts says,
// so a second copy could drift; this test makes that fail instead of letting the report be wrong.
const DOC = path.resolve(__dirname, '../../../../../docs/permissions.md');

// `| `code` | Yes | No | No | No | ... |` in the order Administrator, Manager, Employee, Guest.
const ROLE_COLUMNS: RoleId[] = [ROLES.ADMINISTRATOR, ROLES.MANAGER, ROLES.EMPLOYEE, ROLES.GUEST];
const ROW =
  /^\|\s*`([a-z:-]+)`\s*\|\s*(Yes|No)\s*\|\s*(Yes|No)\s*\|\s*(Yes|No)\s*\|\s*(Yes|No)\s*\|/;

function documentedGrants(markdown: string): Map<string, boolean[]> {
  const grants = new Map<string, boolean[]>();
  for (const line of markdown.split('\n')) {
    const match = ROW.exec(line);
    if (match)
      grants.set(
        match[1] as string,
        match.slice(2, 6).map((cell) => cell === 'Yes'),
      );
  }
  return grants;
}

describe('docs/permissions.md', () => {
  const documented = documentedGrants(readFileSync(DOC, 'utf8'));

  it('lists every permission code exactly once, and no other', () => {
    expect([...documented.keys()].sort()).toEqual(Object.values(PERMISSIONS).sort());
  });

  it.each(ROLE_COLUMNS.map((roleId, column) => [roleId, column] as const))(
    'grants the %s role exactly what ROLE_PERMISSIONS grants it',
    (roleId, column) => {
      const grantedInDoc = [...documented]
        .filter(([, cells]) => cells[column])
        .map(([code]) => code)
        .sort();

      expect(grantedInDoc).toEqual([...ROLE_PERMISSIONS[roleId]].sort());
    },
  );

  it('would notice a row that is not parsed instead of passing on nothing', () => {
    expect(documentedGrants('no table here').size).toBe(0);
    expect(documented.size).toBe(16);
  });
});
