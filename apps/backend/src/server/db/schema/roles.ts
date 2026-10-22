import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** The four variant-2 roles. `id` is a stable key (see ROLES), identical in every database. */
export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
});
