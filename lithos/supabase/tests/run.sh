#!/usr/bin/env bash
# Apply schema.sql to a fresh throwaway database and run the owner-only contract tests.
# Usage: DATABASE_URL=postgres://user:pass@host:5432/postgres bash lithos/supabase/tests/run.sh
# Needs a superuser connection to a disposable server — never a real Supabase project.
set -euo pipefail
cd "$(dirname "$0")"
ADMIN_URL="${DATABASE_URL:?set DATABASE_URL to a disposable superuser connection}"
DB="lithos_test_$$"
case "$ADMIN_URL" in *\?*) TEST_URL="${ADMIN_URL%%/postgres\?*}/$DB?${ADMIN_URL#*\?}" ;; *) TEST_URL="${ADMIN_URL%/*}/$DB" ;; esac
psql -X -q -v ON_ERROR_STOP=1 "$ADMIN_URL" -c "create database $DB"
trap 'psql -X -q "$ADMIN_URL" -c "drop database if exists $DB with (force)" >/dev/null' EXIT
psql -X -q -v ON_ERROR_STOP=1 "$TEST_URL" -f 00_supabase_stub.sql
psql -X -q -v ON_ERROR_STOP=1 "$TEST_URL" -f ../schema.sql
psql -X -v ON_ERROR_STOP=1 "$TEST_URL" -f 10_owner_only.sql
