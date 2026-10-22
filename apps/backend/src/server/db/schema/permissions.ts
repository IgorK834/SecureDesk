import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Fine-grained permissions. `code` is the machine-readable value from PERMISSIONS. */
export const permissions = sqliteTable('permissions', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  description: text('description').notNull(),
});
