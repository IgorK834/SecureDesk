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
    const attribute = /^(\w+)\s+(\w+)(?:\s+([A-Z]+(?:\s*,\s*[A-Z]+)*))?(?:\s+"[^"]*")?$/.exec(line);

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
      };
    } else if (line !== '' && line !== 'erDiagram') {
      throw new Error(`unparsed line in the ER diagram: "${line}"`);
    }
  }
  return { entities, relations };
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

  it('detects a column missing from the diagram', () => {
    const doc = readFileSync(DOC, 'utf8').replace(/^\s*TEXT first_name\n/m, '');

    expect(Object.keys(parseDiagram(doc).entities.users ?? {})).not.toContain('first_name');
  });
});
