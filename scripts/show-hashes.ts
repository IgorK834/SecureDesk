import path from 'node:path';
import Database from 'better-sqlite3';

const databasePath = path.resolve(process.argv[2] ?? process.env.E2E_DATABASE_PATH ?? '');
if (!process.argv[2] && !process.env.E2E_DATABASE_PATH) {
  throw new Error('Pass the isolated database path as the first argument.');
}

const db = new Database(databasePath, { readonly: true, fileMustExist: true });
const rows = db
  .prepare('SELECT login, password_hash AS passwordHash FROM users ORDER BY login_normalized')
  .all() as { login: string; passwordHash: string }[];

console.log(`SecureDesk password-hash evidence (${path.basename(databasePath)})`);
console.log('Only truncated PHC strings are shown; no plaintext credential is read or printed.');
for (const { login, passwordHash } of rows) {
  const truncated = `${passwordHash.slice(0, 30)}...${passwordHash.slice(-10)}`;
  console.log(`${login.padEnd(12)} ${truncated}`);
}
db.close();
