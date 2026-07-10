#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MIGRATIONS=(
  "supabase/migrations/20260710143000_project_subscriptions.sql"
  "supabase/migrations/20260710190000_project_conversation_threads.sql"
)
VERSIONS=(
  "20260710143000"
  "20260710190000"
)

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  QUERY_ARGS=(--db-url "$SUPABASE_DB_URL")
  REPAIR_ARGS=(--db-url "$SUPABASE_DB_URL")
elif [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  QUERY_ARGS=(--linked --password "$SUPABASE_DB_PASSWORD")
  REPAIR_ARGS=(--linked --password "$SUPABASE_DB_PASSWORD")
else
  echo "Set SUPABASE_DB_URL or SUPABASE_DB_PASSWORD before running this script." >&2
  echo "- SUPABASE_DB_URL works without Supabase CLI profile setup." >&2
  echo "- SUPABASE_DB_PASSWORD uses the linked project in supabase/.temp/project-ref." >&2
  exit 1
fi

for migration in "${MIGRATIONS[@]}"; do
  echo "Applying ${migration} ..."
  supabase db query "${QUERY_ARGS[@]}" -f "$migration"
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

echo "Verifying migration history ..."
supabase db query "${QUERY_ARGS[@]}" <<'SQL'
select version
from supabase_migrations.schema_migrations
where version in ('20260710143000', '20260710190000')
order by version;
SQL

echo "Slack copilot schema rollout complete."
