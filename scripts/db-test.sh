#!/usr/bin/env bash
# Run all Supabase migrations and pgTAP tests against a throwaway local
# Postgres 16 cluster. Mirrors `supabase test db` without needing Docker.
#
#   pnpm db:test            # fresh database, all migrations, all tests
#
# Requires: postgresql-16 server binaries, postgresql-16-pgtap, pg_prove.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${HVEMS_PGDATA:-/tmp/hvems-pgdata}"
PGPORT="${HVEMS_PGPORT:-54329}"
DB="hvems_test"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then RUN_AS=(sudo -u postgres); fi

export PGHOST=/tmp PGPORT PGUSER=postgres

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  mkdir -p "$PGDATA"; [ ${#RUN_AS[@]} -gt 0 ] && chown postgres:postgres "$PGDATA"
  "${RUN_AS[@]}" "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/dev/null
fi
if ! "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=''" \
    -l "$PGDATA/server.log" start -w >/dev/null
fi

psql -X -q -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/scripts/db/supabase-shim.sql" >/dev/null

echo "Applying migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "  $(basename "$f")"
  psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null
done

echo "Running pgTAP tests"
cd "$ROOT/supabase/tests"
pg_prove -d "$DB" --ext .sql -r . "$@"
