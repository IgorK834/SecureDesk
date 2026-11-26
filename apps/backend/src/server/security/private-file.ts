import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

/** Resolve existing ancestors too, so aliases cannot point into a served tree. */
export function physicalPath(filename: string): string {
  const suffix: string[] = [];
  let ancestor = path.resolve(filename);
  while (!lstatSync(ancestor, { throwIfNoEntry: false })) {
    suffix.unshift(path.basename(ancestor));
    ancestor = path.dirname(ancestor);
  }
  return path.join(realpathSync(ancestor), ...suffix);
}

export function privateFilePath(filename: string, variable: string): string {
  const resolved = path.resolve(filename);
  const real = physicalPath(resolved);
  for (const candidate of [resolved, real]) {
    const segments = candidate.toLowerCase().split(path.sep);
    if (segments.includes('public') || segments.includes('frontend')) {
      throw new Error(variable + ' must be outside public and frontend directories.');
    }
  }
  const existing = lstatSync(resolved, { throwIfNoEntry: false });
  if (existing && !existing.isFile()) {
    throw new Error(variable + ' must name a regular file.');
  }
  return real;
}
