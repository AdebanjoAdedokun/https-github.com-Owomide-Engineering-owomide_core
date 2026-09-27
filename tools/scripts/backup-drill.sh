#!/usr/bin/env bash
# Backup and restore drill (Release 1 exit criterion: "a backup is restored and checked, including
# permissions and decision authority").
#
#   SOURCE_DATABASE_URL  database to back up (read-only use: pg_dump)
#   DRILL_ADMIN_URL      superuser URL on the server where the scratch copy is restored; its
#                        database name is only used to connect
#   KEEP_DRILL_DB=1      keep the restored copy for inspection
#
# Steps: dump (custom format) -> create a scratch database -> make sure every service role exists
# -> restore with ownership and grants -> compare exact row counts of every service table and the
# migration ledger -> run the database invariant check (row-level security, privileges,
# SECURITY DEFINER settings) on the restored copy. Exits non-zero on any difference.
set -euo pipefail

: "${SOURCE_DATABASE_URL:?set SOURCE_DATABASE_URL}"
: "${DRILL_ADMIN_URL:?set DRILL_ADMIN_URL}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MANIFEST="$ROOT/infra/db/roles.yaml"
WORK="$(mktemp -d)"
DRILL_DB="restore_drill_$(date -u +%Y%m%d%H%M%S)"
trap 'rm -rf "$WORK"' EXIT

# Service schemas and roles from the manifest (lines "role: x" and "schema: y").
mapfile -t ROLES < <(sed -n 's/^ *role: *//p' "$MANIFEST")
mapfile -t SCHEMAS < <(sed -n 's/^ *schema: *//p' "$MANIFEST")
SCHEMA_LIST=$(printf "'%s'," "${SCHEMAS[@]}"); SCHEMA_LIST="${SCHEMA_LIST%,}"

drill_url() { python3 - "$DRILL_ADMIN_URL" "$1" <<'PY'
import sys
from urllib.parse import urlsplit, urlunsplit
u = urlsplit(sys.argv[1])
print(urlunsplit((u.scheme, u.netloc, "/" + sys.argv[2], u.query, u.fragment)))
PY
}
DRILL_URL="$(drill_url "$DRILL_DB")"

echo "1/5 Dumping source database"
started=$(date +%s)
pg_dump --format=custom --no-password --file "$WORK/backup.dump" "$SOURCE_DATABASE_URL"
echo "    $(du -h "$WORK/backup.dump" | cut -f1) in $(( $(date +%s) - started ))s"

echo "2/5 Creating scratch database $DRILL_DB"
psql -X -q -v ON_ERROR_STOP=1 "$DRILL_ADMIN_URL" -c "CREATE DATABASE \"$DRILL_DB\""
cleanup_db() {
  if [ "${KEEP_DRILL_DB:-0}" != "1" ]; then
    psql -X -q "$DRILL_ADMIN_URL" -c "DROP DATABASE IF EXISTS \"$DRILL_DB\"" >/dev/null || true
  else
    echo "Kept $DRILL_DB"
  fi
}
trap 'cleanup_db; rm -rf "$WORK"' EXIT

echo "3/5 Ensuring service roles exist (grants in the dump need them)"
for role in "${ROLES[@]}"; do
  psql -X -q -v ON_ERROR_STOP=1 "$DRILL_ADMIN_URL" -c \
    "DO \$\$ BEGIN CREATE ROLE \"$role\" NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$"
done

echo "4/5 Restoring"
started=$(date +%s)
pg_restore --no-password --exit-on-error --dbname "$DRILL_URL" "$WORK/backup.dump"
echo "    restored in $(( $(date +%s) - started ))s"

echo "5/5 Comparing"
COUNT_SQL="
  SELECT n.nspname || '.' || c.relname AS name,
         (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint AS rows
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p')
    AND (n.nspname IN ($SCHEMA_LIST) OR (n.nspname = 'public' AND c.relname = 'schema_migrations'))
  ORDER BY 1"
# Row-level security is forced on tenant tables, so counts are taken as the connecting superuser.
psql -X -A -t -F ' ' -v ON_ERROR_STOP=1 "$SOURCE_DATABASE_URL" -c "$COUNT_SQL" > "$WORK/source.txt"
psql -X -A -t -F ' ' -v ON_ERROR_STOP=1 "$DRILL_URL" -c "$COUNT_SQL" > "$WORK/restored.txt"
if ! diff -u "$WORK/source.txt" "$WORK/restored.txt"; then
  echo "FAIL: restored row counts differ from the source" >&2
  exit 1
fi
echo "    $(wc -l < "$WORK/source.txt") tables, $(awk '{s+=$2} END {print s+0}' "$WORK/source.txt") rows: identical"

(cd "$ROOT/tools/scripts/migrate" && DATABASE_URL="$DRILL_URL" pnpm --silent run migrate check)
echo "PASS: backup restored with identical data, and every database invariant holds on the copy"
