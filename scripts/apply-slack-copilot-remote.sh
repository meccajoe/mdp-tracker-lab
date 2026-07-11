#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MIGRATIONS=(
  "supabase/migrations/20260710143000_project_subscriptions.sql"
  "supabase/migrations/20260710190000_project_conversation_threads.sql"
  "supabase/migrations/20260711111500_project_subscription_scopes.sql"
)
VERSIONS=(
  "20260710143000"
  "20260710190000"
  "20260711111500"
)

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  DB_URL="$SUPABASE_DB_URL"
elif [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  POOLER_URL_FILE="supabase/.temp/pooler-url"
  if [[ ! -f "$POOLER_URL_FILE" ]]; then
    echo "Missing $POOLER_URL_FILE. Set SUPABASE_DB_URL instead." >&2
    exit 1
  fi

  BASE_DB_URL="$(cat "$POOLER_URL_FILE")"
  DB_URL="$(python3 - <<'PY' "$BASE_DB_URL" "$SUPABASE_DB_PASSWORD"
import sys
from urllib.parse import quote, urlsplit, urlunsplit

base = sys.argv[1]
password = quote(sys.argv[2], safe='')
parts = urlsplit(base)
if '@' not in parts.netloc:
    raise SystemExit('Pooler URL is missing username/host information.')
userinfo, hostinfo = parts.netloc.split('@', 1)
if ':' in userinfo:
    username = userinfo.split(':', 1)[0]
else:
    username = userinfo
netloc = f"{username}:{password}@{hostinfo}"
print(urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment)))
PY
 )"
else
  echo "Set SUPABASE_DB_URL or SUPABASE_DB_PASSWORD before running this script." >&2
  echo "- SUPABASE_DB_URL works without Supabase CLI profile setup." >&2
  echo "- SUPABASE_DB_PASSWORD uses the linked project in supabase/.temp/project-ref." >&2
  exit 1
fi

QUERY_ARGS=(--db-url "$DB_URL")
REPAIR_ARGS=(--db-url "$DB_URL")

for migration in "${MIGRATIONS[@]}"; do
  echo "Applying ${migration} ..."
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$migration"
done

echo "Repairing migration history ..."
supabase migration repair "${REPAIR_ARGS[@]}" --status applied "${VERSIONS[@]}"

echo "Verifying tables ..."
supabase db query "${QUERY_ARGS[@]}" <<'SQL'
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('project_subscriptions', 'project_conversation_threads')
order by table_name;
SQL

echo "Verifying scope columns ..."
supabase db query "${QUERY_ARGS[@]}" <<'SQL'
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'project_subscriptions'
  and column_name in ('scope_type', 'scope_json')
order by column_name;
SQL

echo "Verifying migration history ..."
supabase db query "${QUERY_ARGS[@]}" <<'SQL'
select version
from supabase_migrations.schema_migrations
where version in ('20260710143000', '20260710190000', '20260711111500')
order by version;
SQL

echo "Slack copilot schema rollout complete."
