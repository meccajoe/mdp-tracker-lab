# Schema bootstrap review

## Provenance and scope

- Source project: `yaftybqzlbbvzwwdzlny` (`MDP Project Tracker`).
- Intended lab project: `gkvaeqlqrthztobxitvn` (`mdp-tracker-lab`).
- Repository baseline: `830204913ab0c434af0d6bb3eca971189bead229`.
- Export and verification date: 2026-09-25.
- Source server: PostgreSQL 17.6.
- Disposable server: PostgreSQL 17.11.
- Bootstrap: `supabase/bootstrap/20260925_production_public_schema.sql`.

The normal `supabase db dump --linked --schema public` route could not be used reliably because Docker Desktop's local image store was unresponsive and the temporary CLI role could not complete the initial `pg_dump` lock sequence. The committed bootstrap was instead generated from `pg_catalog` by `tools/lab/generate_production_schema_ddl.sql`.

`tools/lab/run_remote_catalog_query.py` obtains a short-lived CLI role but executes each catalog script in a single transaction with `default_transaction_read_only=on`. The generator uses only catalog `SELECT` statements. It does not select application-table rows or write to the hosted project.

## Reproducible commands

Local schema-only restore:

```bash
bash scripts/lab/verify-schema-bootstrap.sh
```

Fresh read-only export plus source/local semantic comparison:

```bash
bash scripts/lab/compare-schema-bootstrap.sh
```

The comparison requires an authenticated Supabase CLI, the linked pooler metadata in `supabase/.temp/pooler-url`, network access, and PostgreSQL 17 under `/opt/homebrew/opt/postgresql@17/bin` (or `PG17_BIN`). No token, temporary password, pooler credential, or environment file is committed.

## Export safety review

`tools/lab/review_schema_bootstrap.py` parsed 1,555 top-level SQL statements and found:

- 0 top-level `INSERT`, `UPDATE`, `DELETE`, `COPY`, `MERGE`, or `TRUNCATE` statements;
- 0 `CREATE ROLE` or `ALTER ROLE` statements;
- 0 private keys, JWT-shaped values, PostgreSQL URLs, service-role JWTs, or HTTP endpoints;
- no production table rows.

DML text inside stored-function bodies is retained because it defines application behavior; the reviewer distinguishes function bodies from executable top-level data statements.

The bootstrap declares only the application prerequisites `pgcrypto`, `uuid-ossp`, and `btree_gist` in the local `extensions` schema. It does not export managed Supabase schemas, auth users, storage objects, vault values, foreign-server credentials, cron jobs, or extension-owned routines.

## PostgreSQL 17 restore result

The bootstrap restored with `ON_ERROR_STOP=1` into a fresh PostgreSQL 17.11 cluster:

| Property | Result |
|---|---:|
| Public tables | 75 |
| Public views | 3 |
| Public sequences | 1 |
| Public functions | 54 |
| Public policies | 60 |
| Non-internal public triggers | 44 |
| RLS-enabled public tables | 75 |
| PK/FK/unique/check/exclusion constraints | 316 |
| Explicit constraint triggers | 1 |
| Invalid public constraints | 0 |
| Production business rows | 0 |
| `SECURITY DEFINER` functions | 30 |

`project_labor_reconciliation_summary` retained `security_invoker=true`.

Docker Desktop did not answer `docker info` within 20 seconds, so a local Supabase stack with real managed auth was not available. The disposable verifier therefore uses only the isolated compatibility objects in `tools/lab/disposable_supabase_prelude.sql`: roles `anon`, `authenticated`, and `service_role`; `auth.users(id)`; and inert `auth.uid()` / `auth.jwt()` functions.

Those stubs are not included in the hosted bootstrap and must never be applied to Supabase. This verification establishes schema restore and catalog parity only. It does **not** verify Supabase authentication, JWT claims, auth sessions, role switching, policy outcomes, or runtime RLS behavior.

## Semantic source/local parity

The PostgreSQL 17 source and disposable restore each produced 1,722 semantic signatures, with 0 missing and 0 extra:

| Signature category | Count |
|---|---:|
| Live columns | 917 |
| PK/FK/unique/check/exclusion constraints | 316 |
| Explicit constraint-trigger catalog entries | 1 |
| Non-constraint indexes | 118 |
| Functions | 54 |
| Effective function ACLs | 54 |
| Effective table/view/sequence ACLs | 79 |
| RLS policies | 60 |
| RLS table flags | 75 |
| Sequences | 1 |
| Non-internal triggers | 44 |
| Views | 3 |

The comparison covers:

- live column ordinal, type, nullability, identity mode, generated expression, and default;
- sequence type, increment, minimum, maximum, start, cache, cycle, dependency type, and owned table column;
- PK, FK, unique, check, and exclusion definitions plus deferrability, initial-deferred, validation, and inheritance flags;
- function definitions;
- complete explicit trigger definitions;
- view definitions and options;
- RLS enabled/forced flags and complete policy roles, commands, predicates, and checks;
- effective ACLs, including ACL defaults, `PUBLIC EXECUTE`, grantor, grantee, privilege, and grant option.

The current source contains no identity columns and its one public sequence is unowned. Those are affirmative source results, not omitted checks.

### Catalog details intentionally not compared directly

- Dropped-column `pg_attribute` tombstones and their physical `attnum` gaps are excluded. Every live column and its live ordinal are compared, so column order, nullability, defaults, generated expressions, and identity mode remain covered.
- PostgreSQL's internal FK/exclusion trigger names are excluded because they are engine-generated implementation details. Their parent FK/exclusion constraints are compared in full.
- The explicit `validate_quote_proposal_workflow_event` constraint trigger is **not** broadly excluded: its constraint catalog flags and complete `CREATE CONSTRAINT TRIGGER` definition are both compared.
- Sequence current values (`last_value` / `is_called`) are data state, not schema, and are excluded. All sequence options and ownership semantics are compared.
- Extension-owned routines and managed Supabase schemas are excluded because the target Supabase platform owns them; application references to managed auth objects remain in the bootstrap.

## Application checks

- `npm ci`: passed; npm reported 25 dependency advisories (4 low, 4 moderate, 16 high, 1 critical). No dependency versions were changed.
- `node --test tests/lab-safety.test.mjs`: 9 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- Clean placeholder `npm run build`: passed under non-secret, format-valid lab placeholders and an environment stripped of external integration variables. This validates compilation only, not Supabase connectivity or authentication.
- `npm run lint`: failed because Next.js 16 no longer provides `next lint`; the script was interpreted as a `lint` directory.
- `npx eslint .`: ran and reported 150 existing errors and 16 warnings across the baseline. They are outside this schema-bootstrap scope and were not modified.

## Hosted boundary

No SQL was applied to either hosted project. No deployment, production checkout, existing worktree, service, production row, credential, or integration configuration was changed.

Before any future hosted-lab apply:

1. Obtain explicit authorization.
2. Reconfirm project ref `gkvaeqlqrthztobxitvn` and verify the target public schema is empty.
3. Confirm managed auth roles/functions and required extensions exist.
4. Re-review broad grants and all `SECURITY DEFINER` execution permissions.
5. Apply only `supabase/bootstrap/20260925_production_public_schema.sql`; never apply the local stub prelude.
6. Repeat inventory and catalog parity against the hosted lab.
7. Test real authentication and RLS behavior with approved lab users.
8. Seed only approved synthetic/reference data in a separate operation.
