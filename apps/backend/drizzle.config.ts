import { defineConfig } from 'drizzle-kit';
import { resolveDbPath } from './src/server/db/config';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/db/schema/index.ts',
  out: './src/server/db/migrations',
  dbCredentials: { url: resolveDbPath() },
});
