#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_REF="${SOURCE_SUPABASE_PROJECT_REF:-yaftybqzlbbvzwwdzlny}"
POOLER_URL_FILE="${SOURCE_POOLER_URL_FILE:-$ROOT/supabase/.temp/pooler-url}"
PG_BIN="${PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
BOOTSTRAP="$ROOT/supabase/bootstrap/20260925_production_public_schema.sql"
GENERATOR="$ROOT/tools/lab/generate_production_schema_ddl.sql"
SIGNATURES="$ROOT/tools/lab/schema_signatures.sql"
PRELUDE="$ROOT/tools/lab/disposable_supabase_prelude.sql"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/mdp-lab-schema-parity.XXXXXX")"
PGDATA="$WORK/data"
PGSOCK="$WORK/socket"

cleanup() {
  if [[ -d "$PGDATA" ]]; then
    "$PG_BIN/pg_ctl" -D "$PGDATA" stop -m fast >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for command in initdb pg_ctl postgres psql; do
  test -x "$PG_BIN/$command" || {
    printf 'Missing PostgreSQL 17 command: %s/%s\n' "$PG_BIN" "$command" >&2
    exit 1
  }
done
"$PG_BIN/postgres" --version | grep -Eq 'PostgreSQL\) 17\.' || {
  printf 'PostgreSQL 17 is required.\n' >&2
  exit 1
}
for path in "$POOLER_URL_FILE" "$BOOTSTRAP" "$GENERATOR" "$SIGNATURES" "$PRELUDE"; do
  test -f "$path" || {
    printf 'Missing prerequisite: %s\n' "$path" >&2
    exit 1
  }
done

export PATH="$PG_BIN:$PATH"
GENERATED="$WORK/generated.sql"
for attempt in 1 2 3; do
  if python3 "$ROOT/tools/lab/run_remote_catalog_query.py" \
      "$PROJECT_REF" "$POOLER_URL_FILE" "$GENERATOR" "$GENERATED"; then
    break
  fi
  if [[ "$attempt" == 3 ]]; then
    printf 'Source schema generation failed after three attempts.\n' >&2
    exit 1
  fi
  sleep 15
done
python3 "$ROOT/tools/lab/review_schema_bootstrap.py" "$GENERATED"
cmp "$GENERATED" "$BOOTSTRAP" || {
  printf 'Committed bootstrap differs from a fresh read-only generation.\n' >&2
  exit 1
}
printf 'reproducible_export=pass\n'

mkdir "$PGSOCK"
LC_ALL=en_US.UTF-8 "$PG_BIN/initdb" -D "$PGDATA" --username=postgres --auth=trust >/dev/null
LC_ALL=en_US.UTF-8 "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$WORK/postgres.log" \
  -o "-k $PGSOCK -h ''" start >/dev/null
"$PG_BIN/psql" -h "$PGSOCK" -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "$PRELUDE" >/dev/null
"$PG_BIN/psql" -h "$PGSOCK" -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "$BOOTSTRAP" >/dev/null

for attempt in 1 2 3; do
  if python3 "$ROOT/tools/lab/run_remote_catalog_query.py" \
      "$PROJECT_REF" "$POOLER_URL_FILE" "$SIGNATURES" "$WORK/source.sig"; then
    break
  fi
  if [[ "$attempt" == 3 ]]; then
    printf 'Source signature query failed after three attempts.\n' >&2
    exit 1
  fi
  sleep 15
done
"$PG_BIN/psql" -h "$PGSOCK" -U postgres -d postgres --no-psqlrc \
  -v ON_ERROR_STOP=1 -f "$SIGNATURES" -o "$WORK/local.sig" >/dev/null

python3 - "$WORK/source.sig" "$WORK/local.sig" <<'PY'
from collections import Counter
from pathlib import Path
import sys


def load(path: str) -> set[str]:
    return {
        line
        for line in Path(path).read_text().splitlines()
        if line and not line.startswith(("Output format", "SET"))
    }


source, local = map(load, sys.argv[1:])
missing = source - local
extra = local - source
print(f"source_signatures={len(source)}")
print(f"local_signatures={len(local)}")
print(f"missing_local={len(missing)}")
print(f"extra_local={len(extra)}")
for label, values in (("missing", missing), ("extra", extra)):
    categories = Counter(value.split("|", 1)[0] for value in values)
    print(
        label + "_categories="
        + ",".join(f"{key}:{value}" for key, value in sorted(categories.items()))
    )
    for value in sorted(values)[:20]:
        print(label + "_sample=" + value.rsplit("|", 1)[0])
if missing or extra:
    raise SystemExit(1)
print("semantic_schema_parity=pass")
PY

printf 'postgres_major=17\n'
printf 'auth_behavior_verified=false\n'
printf 'rls_runtime_behavior_verified=false\n'
printf 'managed_auth_mode=local_schema_stubs_only\n'
printf 'parity_workspace=%s\n' "$WORK"
