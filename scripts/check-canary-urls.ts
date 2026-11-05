import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SKIPPED = new Set([
  '.git',
  '.local',
  '.next',
  'coverage',
  'dist',
  'node_modules',
  'output',
  'playwright-report',
  'test-results',
]);
const CANARY_URL = /https?:\/\/[^\s"'`]*canarytokens/i;

async function scan(directory: string): Promise<string[]> {
  const matches: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED.has(entry.name)) continue;
    if (!entry.isDirectory() && entry.name.startsWith('.env') && entry.name !== '.env.example') {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await scan(absolute)));
      continue;
    }
    try {
      if (CANARY_URL.test(await readFile(absolute, 'utf8')))
        matches.push(path.relative(ROOT, absolute));
    } catch {
      // Binary or transient files cannot contain a committed text URL.
    }
  }
  return matches;
}

const matches = await scan(ROOT);
if (matches.length > 0) {
  console.error('Canarytokens URL literals must never be committed:');
  for (const file of matches) console.error(`- ${file}`);
  process.exitCode = 1;
} else {
  console.log('Canarytokens URL scan passed.');
}
