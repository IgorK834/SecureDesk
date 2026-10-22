import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The session token lives only in an HttpOnly cookie, which page scripts cannot read. A token
// copied into any script-readable store would be stolen by a single XSS bug, undoing that
// protection. A token cannot be recognised by its content, so this enforces the rule behind it:
// the Angular source must not use these stores at all. If the app ever needs one for something
// harmless (a theme preference, say), change this test deliberately, with a reason, in review.
const FORBIDDEN = /\b(?:localStorage|sessionStorage|indexedDB)\b|\bdocument\.cookie\b/;
const frontendSource = path.resolve(__dirname, '../apps/frontend/src');

function shippedSourceFiles(): string[] {
  return readdirSync(frontendSource, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:ts|html)$/.test(entry.name))
    .filter((entry) => !/\.spec\.ts$/.test(entry.name)) // tests are not shipped to browsers
    .map((entry) => path.join(entry.parentPath, entry.name));
}

describe('frontend source and browser storage', () => {
  it('finds the frontend source to scan (so an empty scan cannot pass by accident)', () => {
    expect(shippedSourceFiles().length).toBeGreaterThan(3);
  });

  it('recognises every storage API it is meant to forbid (positive control)', () => {
    for (const sample of [
      "localStorage.setItem('t', token)",
      "window.sessionStorage.getItem('t')",
      'indexedDB.open("db")',
      'document.cookie = `sd=${token}`',
    ]) {
      expect(sample).toMatch(FORBIDDEN);
    }
    expect('const storageKey = "cookieBanner"; // not a storage API').not.toMatch(FORBIDDEN);
  });

  it('uses no script-readable storage, so the session token can only be in the HttpOnly cookie', () => {
    const offenders = shippedSourceFiles().filter((file) =>
      FORBIDDEN.test(readFileSync(file, 'utf8')),
    );

    expect(offenders.map((file) => path.relative(frontendSource, file))).toStrictEqual([]);
  });
});
