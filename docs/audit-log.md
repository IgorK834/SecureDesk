# Audit log verification and tamper demonstration

Run these commands from the repository root. The demo requires a migrated E2E database and refuses
production. It also refuses an E2E path that identifies the configured development or test database,
including symbolic and hard links.

## Run the demo with a disposable database

```sh
demo_dir=$(mktemp -d "${TMPDIR:-/tmp}/securedesk-audit-demo.XXXXXX")
export DATABASE_PATH="$demo_dir/dev.sqlite"
export TEST_DATABASE_PATH="$demo_dir/test.sqlite"
export E2E_DATABASE_PATH="$demo_dir/securedesk.e2e.sqlite"
export AUDIT_ANCHOR_PATH=''
SECUREDESK_E2E_DIR="$demo_dir" node_modules/.bin/tsx tests/e2e/setup-db.ts
NODE_ENV=development npm run audit:tamper-demo
scripts/show-audit-table.sh "$E2E_DATABASE_PATH"
```

The demo opens the E2E source read-only and uses SQLite's backup API. It probes the triggers on a
synthetic row in the backup. The four integrity cases use fresh SQLite snapshots populated with
synthetic rows. Each starts with an intact baseline. The demo removes its private working files
when it finishes. The initial fixture remains in `demo_dir` for inspection.

| Scenario                             | Result                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Changed field                        | `HASH_MISMATCH` at sequence 2                                                                                                     |
| Missing middle entry                 | `SEQUENCE_GAP` at sequence 3                                                                                                      |
| Missing tail                         | The chain alone passes. The original anchor reports `HEAD_MISMATCH` at sequence 3.                                                |
| Alternate history with a valid chain | The original anchor reports `HEAD_MISMATCH` at sequence 3. The alternate snapshot passes when verified with its own local anchor. |

The alternate history is generated through the normal audit append path. It demonstrates the
limit of a local witness. An off-host copy of the original anchor can distinguish the two histories.

## Check the triggers manually with sqlite3

Create and inspect a second copy of the disposable fixture from the previous section.
Set the copy's journal mode to `DELETE` so read-only SQLite clients can inspect it without WAL
sidecar files.

```sh
sqlite3 -readonly "$E2E_DATABASE_PATH" ".backup '$demo_dir/manual.sqlite'"
sqlite3 "$demo_dir/manual.sqlite" 'PRAGMA journal_mode = DELETE;'
sqlite3 -readonly "$demo_dir/manual.sqlite" \
  "SELECT name FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'audit_log' ORDER BY name;"
scripts/show-audit-table.sh "$demo_dir/manual.sqlite"
```

Open the copy and attempt both statements. The seed supplies audit rows, and the transaction keeps
the copy intact if a trigger is unexpectedly absent.

```sh
sqlite3 "$demo_dir/manual.sqlite" <<'SQL'
.bail off
BEGIN;
UPDATE audit_log SET description = description
WHERE seq = (SELECT min(seq) FROM audit_log);
DELETE FROM audit_log
WHERE seq = (SELECT min(seq) FROM audit_log);
ROLLBACK;
SQL
```

Both statements should report `audit_log is append-only`. Rerun the table helper to see the same
rows. It shows up to 20 entries with their UTC time, action, outcome, and the first 12 characters
of each hash.

## Reproduce the browser evidence

Run `npm run test:e2e:module3 -- --evidence` for the filtered exports, before-and-after integrity
results and both detection alerts. The browser fixture changes a single synthetic sign-in
under the system temporary directory. The test restores the row and update trigger and then
re-verifies the chain. The external integrations stay off during the browser run.
