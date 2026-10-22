// Test-only schema used to generate the fixture migrations next to it (the real tables are
// delivered in Task 1.3). Regenerate with a one-off drizzle-kit config pointing at this
// file and `out: './src/server/db/__fixtures__/migrations'`.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const parents = sqliteTable('fixture_parents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export const children = sqliteTable('fixture_children', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  parentId: integer('parent_id')
    .notNull()
    .references(() => parents.id),
  label: text('label').notNull(),
});
