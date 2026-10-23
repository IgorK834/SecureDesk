import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMigratedDb } from '../__fixtures__/test-db';
import type { AppDb } from '../connection';

// The ER diagram in docs/database-schema.md is part of the report. This test makes it
// executable: it fails when the diagram and the migrated database disagree.
const DOC = path.resolve(__dirname, '../../../../../../docs/database-schema.md');

interface DiagramColumn {
  type: string;
  keys: string[];
  /** The quoted text after the column, where the diagram states nullability, defaults and CHECKs. */
  note: string;
}
interface Diagram {
  entities: Record<string, Record<string, DiagramColumn>>;
  relations: string[]; // "parent<-child.column"
}

function parseDiagram(markdown: string): Diagram {
  const block = /```mermaid\s+erDiagram\n([\s\S]*?)```/.exec(markdown)?.[1];
  if (!block) throw new Error('no mermaid erDiagram block found in docs/database-schema.md');

  const entities: Diagram['entities'] = {};
  const relations: string[] = [];
  let current: string | undefined;

  for (const line of block.split('\n').map((l) => l.trim())) {
    const open = /^(\w+)\s*\{$/.exec(line);
    const relation = /^(\w+)\s+\S+--\S+\s+(\w+)\s*:\s*"(\w+)"$/.exec(line);
    const attribute = /^(\w+)\s+(\w+)(?:\s+([A-Z]+(?:\s*,\s*[A-Z]+)*))?(?:\s+"([^"]*)")?$/.exec(
      line,
    );

    if (open) {
      current = open[1];
      entities[current as string] = {};
    } else if (line === '}') {
      current = undefined;
    } else if (relation) {
      relations.push(`${relation[1]}<-${relation[2]}.${relation[3]}`);
    } else if (current && attribute) {
      const keys = (attribute[3] ?? '')
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean);
      (entities[current] as Record<string, DiagramColumn>)[attribute[2] as string] = {
        type: attribute[1] as string,
        keys,
        note: attribute[4] ?? '',
      };
    } else if (line !== '' && line !== 'erDiagram') {
      throw new Error(`unparsed line in the ER diagram: "${line}"`);
    }
  }
  return { entities, relations };
}

// What the notes claim about nullability, defaults and CHECK constraints. The diagram is read as
// follows: a column is NOT NULL unless its note says "nullable"; "default X" is stated exactly
// where the column has a default; "CHECK" is stated exactly where a CHECK constraint is about the
// column, and then lists the values or numbers the constraint compares it with.

/** The text of every CHECK(...) in a CREATE TABLE statement, parentheses balanced. */
function checkExpressions(createSql: string): string[] {
  const found: string[] = [];
  for (const match of createSql.matchAll(/CHECK\s*\(/gi)) {
    const start = (match.index as number) + match[0].length;
    let depth = 1;
    let end = start;
    while (depth > 0 && end < createSql.length) {
      if (createSql[end] === '(') depth++;
      if (createSql[end] === ')') depth--;
      end++;
    }
    found.push(createSql.slice(start, end - 1));
  }
  return found;
}

/** The quoted words and the numbers an expression or a note mentions, each once, sorted. */
const constants = (words: string[]) => [...new Set(words)].sort();

/** The constants each column is compared with by a CHECK, keyed by column name. */
function checksByColumn(table: string, createSql: string): Map<string, string[]> {
  const byColumn = new Map<string, string[]>();
  for (const expression of checkExpressions(createSql)) {
    const columns = [...expression.matchAll(/"(\w+)"\."(\w+)"/g)]
      .filter(([, owner]) => owner === table)
      .map(([, , column]) => column as string);
    if (columns.length === 0) {
      throw new Error(`a CHECK on ${table} that names no column of it: CHECK(${expression})`);
    }
    const compared = [...expression.matchAll(/'([^']*)'|\b(\d+)\b/g)].map((m) => m[1] ?? m[2]);
    for (const column of columns) {
      byColumn.set(column, constants([...(byColumn.get(column) ?? []), ...(compared as string[])]));
    }
  }
  return byColumn;
}

/** SQLite hands defaults back as they were written: 'OPEN' with quotes, false as a word. */
const normalizeDefault = (raw: string) => {
  const value = raw.replace(/^'(.*)'$/, '$1');
  return value === 'false' ? '0' : value === 'true' ? '1' : value;
};

/** Every place where the diagram's notes and the migrated database disagree; empty when none. */
function claimProblems(documented: Diagram, database: AppDb): string[] {
  const problems: string[] = [];
  const definitions = database.$client
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations'",
    )
    .all() as { name: string; sql: string }[];

  for (const { name: table, sql } of definitions) {
    const checks = checksByColumn(table, sql);
    const columns = database.$client.pragma(`table_info(${table})`) as {
      name: string;
      notnull: number;
      dflt_value: string | null;
    }[];

    for (const column of columns) {
      const at = `${table}.${column.name}`;
      const note = documented.entities[table]?.[column.name]?.note ?? '';

      const saysNullable = /\bnullable\b/.test(note);
      if (saysNullable === Boolean(column.notnull)) {
        problems.push(
          `${at}: the diagram says ${saysNullable ? 'nullable' : 'NOT NULL (no "nullable" in the note)'}, the table is ${column.notnull ? 'NOT NULL' : 'nullable'}`,
        );
      }

      const claimedDefault = /\bdefault (\w+)/.exec(note)?.[1] ?? null;
      const actualDefault = column.dflt_value === null ? null : normalizeDefault(column.dflt_value);
      if (claimedDefault !== actualDefault) {
        problems.push(
          `${at}: the diagram says default ${claimedDefault ?? 'none'}, the table has ${actualDefault ?? 'none'}`,
        );
      }

      const claimedCheck = /\bCHECK\b([^;]*)/.exec(note)?.[1];
      const actualCheck = checks.get(column.name);
      if ((claimedCheck !== undefined) !== (actualCheck !== undefined)) {
        problems.push(
          `${at}: the diagram ${claimedCheck !== undefined ? 'shows' : 'does not show'} a CHECK, the table ${actualCheck ? 'has' : 'has no'} one`,
        );
      } else if (claimedCheck !== undefined && actualCheck !== undefined) {
        const claimed = constants(claimedCheck.match(/\b[A-Z][A-Z_]+\b|\b\d+\b/g) ?? []);
        if (claimed.join() !== actualCheck.join()) {
          problems.push(
            `${at}: the diagram's CHECK mentions ${claimed.join(', ')}, the constraint ${actualCheck.join(', ')}`,
          );
        }
      }
    }
  }
  return problems;
}

let db: AppDb;
let diagram: Diagram;

beforeAll(() => {
  db = createMigratedDb();
  diagram = parseDiagram(readFileSync(DOC, 'utf8'));
});
afterAll(() => db.$client.close());

const tables = () =>
  (
    db.$client
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations'",
      )
      .all() as { name: string }[]
  ).map((row) => row.name);

describe('docs/database-schema.md ER diagram matches the migrations', () => {
  it('describes exactly the migrated tables', () => {
    expect(Object.keys(diagram.entities).sort()).toEqual(tables().sort());
  });

  it('lists every column of every table with its SQLite type and key markers', () => {
    for (const table of tables()) {
      const info = db.$client.pragma(`table_info(${table})`) as {
        name: string;
        type: string;
        pk: number;
      }[];
      const foreignKeys = new Set(
        (db.$client.pragma(`foreign_key_list(${table})`) as { from: string }[]).map(
          (fk) => fk.from,
        ),
      );
      const uniqueColumns = new Set(
        (
          db.$client.pragma(`index_list(${table})`) as {
            name: string;
            unique: number;
            origin: string;
          }[]
        )
          .filter((index) => index.unique === 1 && index.origin !== 'pk')
          .map((index) => db.$client.pragma(`index_info(${index.name})`) as { name: string }[])
          .filter((columns) => columns.length === 1)
          .map((columns) => (columns[0] as { name: string }).name),
      );

      const expected = Object.fromEntries(
        info.map((column) => [
          column.name,
          {
            type: column.type.toUpperCase(),
            keys: [
              ...(column.pk > 0 ? ['PK'] : []),
              ...(foreignKeys.has(column.name) ? ['FK'] : []),
              ...(uniqueColumns.has(column.name) ? ['UK'] : []),
            ],
          },
        ]),
      );
      const documented = Object.fromEntries(
        Object.entries(diagram.entities[table] ?? {}).map(([name, column]) => [
          name,
          { type: column.type, keys: [...column.keys].sort() },
        ]),
      );

      expect(documented, `table ${table}`).toEqual(
        Object.fromEntries(
          Object.entries(expected).map(([name, column]) => [
            name,
            { ...column, keys: [...column.keys].sort() },
          ]),
        ),
      );
    }
  });

  it('states nullability, defaults and CHECK constraints as the migrated tables have them', () => {
    expect(claimProblems(diagram, db)).toEqual([]);
  });

  it('draws one relationship per foreign key, parent to child, labelled with the column', () => {
    const fromDatabase = tables().flatMap((table) =>
      (db.$client.pragma(`foreign_key_list(${table})`) as { table: string; from: string }[]).map(
        (fk) => `${fk.table}<-${table}.${fk.from}`,
      ),
    );

    expect([...diagram.relations].sort()).toEqual(fromDatabase.sort());
  });
});

describe('parseDiagram (guards the guard)', () => {
  it('rejects a document without a diagram instead of passing vacuously', () => {
    expect(() => parseDiagram('# no diagram here')).toThrow(/no mermaid erDiagram block/);
  });

  it('rejects syntax it does not understand instead of skipping it', () => {
    expect(() => parseDiagram('```mermaid\nerDiagram\n  this is ??? not valid\n```\n')).toThrow(
      /unparsed line/,
    );
  });

  // Each of these is a migration that changes a table while the diagram stays as it is (or the
  // diagram saying something the table does not do). Writing the old text back in turns the real
  // diagram into the stale one, so the check must report it.
  it.each([
    [
      'a column that became nullable, diagram not updated',
      '"nullable timestamp, soft delete"',
      '"timestamp, soft delete"',
      'users.deleted_at',
    ],
    [
      'a column that became NOT NULL, diagram not updated',
      'TEXT first_name\n',
      'TEXT first_name "nullable"\n',
      'users.first_name',
    ],
    [
      'a stage added to the CHECK without the diagram',
      'CHECK: INITIAL_PASSWORD_CHANGE, PASSWORD_EXPIRED, FULLY_AUTHENTICATED',
      'CHECK: INITIAL_PASSWORD_CHANGE, PASSWORD_EXPIRED',
      'sessions.auth_stage',
    ],
    [
      'a status renamed in the diagram only',
      'CHECK: OPEN, IN_PROGRESS, RESOLVED',
      'CHECK: OPEN, IN_PROGRESS, DONE',
      'tickets.status',
    ],
    [
      'a minimum length changed in the diagram only',
      'default 12, CHECK >= 12',
      'default 12, CHECK >= 8',
      'security_settings.min_password_length',
    ],
    [
      'a CHECK the diagram does not show',
      '"CHECK: OPEN, IN_PROGRESS, RESOLVED; default OPEN"',
      '"default OPEN"',
      'tickets.status',
    ],
    [
      'a CHECK the diagram shows but the table lacks',
      'TEXT first_name\n',
      'TEXT first_name "CHECK: ADA"\n',
      'users.first_name',
    ],
    [
      'a default that was changed',
      'default 15',
      'default 30',
      'security_settings.session_idle_timeout_minutes',
    ],
    [
      'a default the diagram does not show',
      'default 12, CHECK >= 12',
      'CHECK >= 12',
      'security_settings.min_password_length',
    ],
    [
      'a default the table does not have',
      'TEXT first_name\n',
      'TEXT first_name "default x"\n',
      'users.first_name',
    ],
  ])('claimProblems reports %s', (_, written, replacement, column) => {
    const doc = readFileSync(DOC, 'utf8');
    // The text must really be in the document, or this would check an unchanged diagram.
    expect(doc, `"${written}" is no longer in ${DOC}`).toContain(written);

    const problems = claimProblems(parseDiagram(doc.replace(written, replacement)), db);

    expect(problems.map((problem) => problem.split(':')[0])).toEqual([column]);
  });

  it('detects a column missing from the diagram', () => {
    const doc = readFileSync(DOC, 'utf8').replace(/^\s*TEXT first_name\n/m, '');

    expect(Object.keys(parseDiagram(doc).entities.users ?? {})).not.toContain('first_name');
  });
});
