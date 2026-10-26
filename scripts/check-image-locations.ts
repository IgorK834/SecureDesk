import { readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const ALLOWED_DIRECTORY = path.join(ROOT, 'docs', 'report-evidence');
const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.local',
  '.next',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);
const IMAGE_EXTENSION = /\.(?:gif|jpe?g|png|webp)$/i;

async function findUnexpectedImages(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await findUnexpectedImages(absolutePath)));
    } else if (
      IMAGE_EXTENSION.test(entry.name) &&
      !absolutePath.startsWith(`${ALLOWED_DIRECTORY}${path.sep}`)
    ) {
      found.push(path.relative(ROOT, absolutePath));
    }
  }

  return found;
}

const unexpectedImages = await findUnexpectedImages(ROOT);
if (unexpectedImages.length > 0) {
  console.error('Image files must be stored under docs/report-evidence/:');
  for (const image of unexpectedImages) console.error(`- ${image}`);
  process.exitCode = 1;
} else {
  console.log('Image location check passed.');
}
