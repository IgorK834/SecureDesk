import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// Next.js only reads .env files from apps/backend, but the single .env lives at the repo root.
// forceReload is required: @next/env otherwise returns its cached result from apps/backend.
loadEnvConfig(
  path.resolve(process.cwd(), '../..'),
  process.env.NODE_ENV !== 'production',
  console,
  true,
);

const nextConfig: NextConfig = {
  agentRules: false,
  // Native modules must be required at runtime, not bundled.
  serverExternalPackages: ['better-sqlite3', 'argon2'],
};

export default nextConfig;
