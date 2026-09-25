#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BOOTSTRAP="$ROOT/supabase/bootstrap/20260925_production_public_schema.sql"
PRELUDE="$ROOT/tools/lab/disposable_supabase_prelude.sql"
PG_BIN="${PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/mdp-lab-schema-verify.XXXXXX")"
PGDATA="$WORK/data"
PGSOCK="$WORK/socket"
LOG="$WORK/postgres.log"

cleanup() {
  if [[ -d "$PGDATA" ]]; then
    LC_ALL=en_US.UTF-8 "$PG_BIN/pg_ctl" -D "$PGDATA" stop -m fast >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for command in initdb pg_ctl psql postgres; do
  test -x "$PG_BIN/$command" || {
    printf 'Missing required PostgreSQL 17 command: %s/%s\n' "$PG_BIN" "$command" >&2
    exit 1
  }
done

test -f "$BOOTSTRAP"
test -f "$PRELUDE"
"$PG_BIN/postgres" --version | grep -Eq 'PostgreSQL\) 17\.' || {
  printf 'PostgreSQL 17 is required; found: %s\n' "$("$PG_BIN/postgres" --version)" >&2
  exit 1
}
mkdir "$PGSOCK"
LC_ALL=en_US.UTF-8 "$PG_BIN/initdb" -D "$PGDATA" --username=postgres --auth=trust >/dev/null
LC_ALL=en_US.UTF-8 "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$LOG" \
  -o "-k $PGSOCK -h ''" start >/dev/null

"$PG_BIN/psql" -h "$PGSOCK" -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "$PRELUDE" >/dev/null

"$PG_BIN/psql" -h "$PGSOCK" -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f "$BOOTSTRAP" >/dev/null

actual="$("$PG_BIN/psql" -h "$PGSOCK" -U postgres -d postgres -At -F= <<'SQL'
select 'server_major',current_setting('server_version_num')::int / 10000;
select 'tables',count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';
select 'views',count(*) from information_schema.views where table_schema='public';
select 'sequences',count(*) from information_schema.sequences where sequence_schema='public';
select 'functions',count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
select 'policies',count(*) from pg_policies where schemaname='public';
select 'triggers',count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal;
select 'rls_enabled_tables',count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity;
select 'invalid_constraints',count(*) from pg_constraint co join pg_namespace n on n.oid=co.connamespace where n.nspname='public' and not co.convalidated;
select 'semantic_constraints',count(*) from pg_constraint co join pg_namespace n on n.oid=co.connamespace where n.nspname='public' and co.contype in ('p','u','c','x','f');
select 'constraint_triggers',count(*) from pg_constraint co join pg_namespace n on n.oid=co.connamespace where n.nspname='public' and co.contype='t';
select 'data_rows',coalesce(sum(n_live_tup),0)::bigint from pg_stat_user_tables where schemaname='public';
select 'security_definer_functions',count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef;
select 'project_labor_reconciliation_summary_security_invoker',coalesce(array_to_string(c.reloptions,','),'') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='project_labor_reconciliation_summary';
SQL
)"

expected="$(cat <<'EOF'
server_major=17
tables=75
views=3
sequences=1
functions=54
policies=60
triggers=44
rls_enabled_tables=75
invalid_constraints=0
semantic_constraints=316
constraint_triggers=1
data_rows=0
security_definer_functions=30
project_labor_reconciliation_summary_security_invoker=security_invoker=true
EOF
)"

if [[ "$actual" != "$expected" ]]; then
  printf 'Schema verification mismatch.\nExpected:\n%s\nActual:\n%s\n' "$expected" "$actual" >&2
  exit 1
fi

printf '%s\n' "$actual"
printf 'schema_bootstrap_verification=pass\n'
printf 'auth_behavior_verified=false\n'
printf 'rls_runtime_behavior_verified=false\n'
printf 'managed_auth_mode=local_schema_stubs_only\n'
printf 'disposable_cluster=%s\n' "$WORK"
