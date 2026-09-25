# Lab status

## Confirmed
- Private repository: meccajoe/mdp-tracker-lab.
- Sanitized bootstrap main verified at f493458f3a72b27500d10c2670bdf009efee4646.
- Supabase project gkvaeqlqrthztobxitvn exists in Mecca Design & Production; public schema was empty at setup verification.
- Original source baseline and sanitation details: LAB_BOOTSTRAP_PROVENANCE.md.
- Vercel cron schedules removed from lab configuration.
- Lab environment example contains no external integration credentials.
- Paul's email added to the quote product allowlist; this does not create an auth user or grant workspace membership.
- Production `public` schema exported without data through catalog queries forced read-only, security-reviewed, and restored into disposable PostgreSQL 17.
- Reviewed bootstrap, repeatable exporter/verifier, and 1,722-signature source/local parity check are recorded in `supabase/bootstrap/20260925_production_public_schema.sql`, `scripts/lab/`, `tools/lab/`, and `docs/lab/SCHEMA_BOOTSTRAP_REVIEW.md`.

## Next work
1. Create the dedicated Vercel project and configure only lab credentials.
2. Configure authentication and verify Joe/Paul login and workspace permissions.
3. Apply the reviewed schema bootstrap to the hosted lab only after explicit authorization and a fresh empty-schema preflight.
4. Load approved sample data, then reproduce Fonroche.
5. Configure Paul's Codex workspace when his GitHub username is available.

## Latest implementation checks
- Added strict lab URL and legacy JWT project/role checks at Next configuration load and API/auth request handling.
- Reject known external integration environment variables and block known integration API paths.
- Restricted browser connection destinations, removed production CORS settings, added noindex and a sandbox banner.
- Login redirects to the current origin instead of a production hostname.
- Nine focused Node tests, TypeScript, and a clean placeholder production build pass. Real lab connectivity, authentication, RLS behavior, and browser verification remain pending approved lab credentials/users.
- Schema-only bootstrap procedure: docs/lab/DATABASE_BOOTSTRAP.md.
- PostgreSQL 17 schema verification: 75 tables, 3 views, 1 sequence, 54 functions, 60 policies, 44 non-internal triggers, 316 PK/FK/unique/check/exclusion constraints, 1 explicit constraint trigger, 75 RLS-enabled tables, zero invalid constraints, and zero business rows.
- Semantic parity passes with 1,722 source and 1,722 local signatures, zero missing and zero extra, including column nullability/defaults, sequences/options/ownership, constraints, functions, triggers, views, RLS, and effective grants/grant options.
- Bootstrap review found no credential-shaped literals, hardcoded endpoints, outbound database calls, cron jobs, vault references, or foreign servers. Production grants and 30 `SECURITY DEFINER` functions are preserved and documented for pre-deployment review.
- Local verification uses auth schema stubs only because Docker Desktop remained unresponsive. Authentication and runtime RLS behavior are explicitly not verified.
- App checks: lab safety 9/9, TypeScript pass, clean placeholder build pass. Direct ESLint reports 150 existing errors and 16 warnings; the configured `next lint` command is obsolete under Next.js 16.

## Not yet ready
No application deployment, database bootstrap, auth-user creation, live data refresh, or completed quote implementation is claimed.
The original production credential reported by Hermes has not been rotated as part of this task. Coordinate that separately.

## Session reporting
Update this file with completed changes, validation evidence, current blockers, and the next concrete task. Keep business decisions in the working brief.
