# Lab status

## Confirmed
- Private repository: meccajoe/mdp-tracker-lab.
- Sanitized bootstrap main verified at f493458f3a72b27500d10c2670bdf009efee4646.
- Supabase project gkvaeqlqrthztobxitvn exists in Mecca Design & Production; schema bootstrap and hosted corrections are applied. Before hardening, hosted parity was 1,722 signatures with zero differences and 75 tables reported zero rows. Subsequent lab-only hardening intentionally changes two view options and nine function search paths.
- Original source baseline and sanitation details: LAB_BOOTSTRAP_PROVENANCE.md.
- Vercel cron schedules removed from lab configuration.
- Lab environment example contains no external integration credentials.
- Paul's email added to the quote product allowlist; this does not create an auth user or grant workspace membership.
- Production `public` schema exported without data through catalog queries forced read-only, security-reviewed, and restored into disposable PostgreSQL 17.
- Reviewed bootstrap, repeatable exporter/verifier, and 1,722-signature source/local parity check are recorded in `supabase/bootstrap/20260925_production_public_schema.sql`, `scripts/lab/`, `tools/lab/`, and `docs/lab/SCHEMA_BOOTSTRAP_REVIEW.md`.

## Next work
1. Dedicated Vercel project created and first deployment READY; finish live authentication and authorization verification.
2. Configure authentication and verify Joe/Paul login and workspace permissions.
3. Review inherited view/function exposure and verify real auth/RLS behavior before loading samples or opening access.
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
Hosted database bootstrap is complete; see docs/lab/HOSTED_BOOTSTRAP_VERIFICATION.md. First application deployment is READY. Auth-user creation, successful login, live data refresh, and completed quote implementation remain unverified/not completed.
The original production credential reported by Hermes has not been rotated as part of this task. Coordinate that separately.

## Session reporting
Update this file with completed changes, validation evidence, current blockers, and the next concrete task. Keep business decisions in the working brief.

## Hosted hardening — September 25, 2026
- Applied `lab_harden_view_and_function_resolution` only to gkvaeqlqrthztobxitvn; replay SQL: `supabase/bootstrap/lab_view_function_hardening.sql`.
- All three public views now use security_invoker=true. Nine previously mutable function search paths are pinned to pg_catalog, public, pg_temp. Client roles cannot CREATE in public.
- Catalog verification and pure-function smoke checks passed. Security advisors no longer report security_definer_view or function_search_path_mutable.
- Remaining advisors: 20 RLS-enabled tables without client policies, two anon-executable and 20 authenticated-executable SECURITY DEFINER functions. These remain review items, not a clean security certification.
- Attempted authenticated role probe was denied by the management connection; no role grants were changed to bypass this. Real JWT/RLS and browser tests remain pending.
- Vercel project creation/environment configuration are unavailable in the exposed connector. Automatic approval review rejected an unparameterized deployment because its destination was not established. No deployment occurred. Browser fallback requires user approval; exact proposed setup is in docs/lab/DEPLOYMENT_SETUP.md.

## First Vercel deployment — September 25, 2026
- Project mdp-tracker-lab: prj_H6frjmh8wPjYXFzK4aBHRjd7VhmF, team team_EEoCcHOGaLxcpWCZACyMGC54.
- Deployment dpl_DPYGEKoSDtjS4WvD8Xs6kwU9iue8 is READY; source main at 20af07ac792b386c51e63e429555d604f52cce15, Next.js 16.1.6, Node 24.x. Build/deployment took about 3 minutes.
- Verified browser URL: https://mdp-tracker-lab-meccanics.vercel.app/login. Root redirects signed-out visitor to login; sandbox banner visible.
- Exactly NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY saved for Production and Preview; no shared team variables linked. User entered server key directly in Vercel; value was not read or printed.
- Google sign-in transition was rejected by cloud browser URL policy; no attempt to bypass. Direct API guard navigation returned ERR_BLOCKED_BY_CLIENT. Neither test is claimed successful.
- Remaining: verify/configure lab Google provider and redirects, real JWT/RLS and workspace permissions, server-side database access, then seed samples and onboard Paul. No production resources changed.
- The earlier Vercel connector blocker was resolved through user-approved browser setup. This documentation commit may trigger a subsequent Git deployment; the READY evidence above applies to the specified source SHA.


## v27 calculation foundation — September 29, 2026
- Implemented a pure workbook calculation engine, reproducible Fonroche fixture, and 13 passing calculation/acceptance tests. See docs/lab/V27_CALCULATOR.md. All 18 populated workbook line outputs match, including $28,953.192 sell and $11,890.64 build budget.
- Strict standalone TypeScript 6.0.2 check passed for the new engine; 7 changed files scanned without credential-shaped values. Full application build and browser checks were not run for this unconnected module.
- Explicitly preserved the $1,250 PM fee override discovered in Fonroche N36; the template-calculated fee remains independently available.
- Snapshot includes 698 cached catalog entries, stable material/line/trade IDs, versioned assumptions, nullable overrides, and trade-hour reconciliation warnings. No live catalog connection was enabled.
- This is a calculation foundation only. Editor integration, hosted versioned persistence, browser save/reopen, upstream estimator editing, and capacity are not yet implemented or verified. No database migration or business-data writes in this slice.
- Authentication follow-up from September 26–28: primary lab URL is https://mdp-tracker-lab.vercel.app/login. The older meccanics deployment alias can require Vercel authentication and should not be used for user onboarding. Google provider and redirects were configured; Joe's auth identity and create_workspace capability were observed. At the last membership check Joe had zero active workspaces. Paul login and workspace authorization remain unverified.
- Next concrete task: connect a versioned, membership-authorized quote editor and verify quantity/cost/labor/override edits across a real hosted save/reopen.
