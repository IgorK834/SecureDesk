#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "$0")/.." && pwd)"
database_path="${1:-${E2E_DATABASE_PATH:-}}"

if [[ -z "$database_path" ]]; then
  echo "Usage: scripts/show-hashes.sh PATH_TO_ISOLATED_DATABASE" >&2
  exit 2
fi

cd "$repository_root"
node --experimental-strip-types scripts/show-hashes.ts "$database_path"
