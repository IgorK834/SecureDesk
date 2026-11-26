#!/bin/sh
set -eu

database=${1:-${E2E_DATABASE_PATH:-}}
if [ "$#" -gt 1 ] || [ -z "$database" ] || [ ! -f "$database" ]; then
  printf '%s\n' 'Usage: scripts/show-audit-table.sh path/to/e2e-copy.sqlite' >&2
  exit 1
fi

exec node --input-type=module - "$database" <<'JS'
import { DatabaseSync } from 'node:sqlite';

const database = new DatabaseSync(process.argv[2], { readOnly: true });
try {
  const rows = database.prepare(`
    SELECT seq, occurred_at AS time_utc, action, outcome,
           substr(prev_hash, 1, 12) AS prev_hash, substr(entry_hash, 1, 12) AS entry_hash
    FROM audit_log
    ORDER BY seq DESC
    LIMIT 20
  `).all();
  console.log('seq\ttime (UTC)\taction\toutcome\tprev_hash\tentry_hash');
  for (const row of rows) console.log(Object.values(row).join('\t'));
} finally {
  database.close();
}
JS
