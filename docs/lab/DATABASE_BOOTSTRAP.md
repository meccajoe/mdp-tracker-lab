# Database bootstrap handoff

## Targets
Production source (read-only metadata/export): yaftybqzlbbvzwwdzlny, MDP Project Tracker.
Lab destination: gkvaeqlqrthztobxitvn, mdp-tracker-lab.
Both belong to organization cqyvrbacdmbytzmoakag, Mecca Design & Production.
Do not infer the target from an existing linked CLI project or copied environment file.

## Read-only inventory, 2026-09-25
Production public schema: 75 tables, 3 views, 1 sequence, 54 functions, 60 policies, 44 non-internal triggers.
All 75 public tables reported RLS enabled. This does not prove each policy is appropriately restrictive.
Migration history reports 51 entries. The source repository has additional migrations and duplicate version 20260812170000; migration presence is not proof of deployed schema parity.

## Authorized next task for Hermes in an isolated lab clone
1. Fetch lab main and read AGENTS.md. No original production Git history may enter this clone.
2. Using existing authorized access, obtain a schema-only export of the production application schema. Never use the exposed credential. Never copy environment files into the lab.
3. Inspect dependencies on managed auth/storage schemas, extensions, custom roles, and functions before deciding export scope. Do not export auth users, storage objects, table data, vault values, foreign-server credentials, or scheduled jobs.
4. Review function bodies/defaults/triggers for hardcoded secrets, production endpoints and outbound calls. Quarantine operational integration code as necessary and document intentional differences.
5. Preserve application constraints, indexes, RLS policies, required grants and safe function definitions. Do not replace policies with permissive shortcuts. Audit SECURITY DEFINER functions, execute grants, and view security.
6. Restore into a disposable local Supabase instance first. Do not run the existing migration folder wholesale. Reconcile the application schema against source inventory, identifying deliberate exclusions and external dependencies.
7. Commit the reviewed bootstrap SQL, repeatable instructions, and a source-to-lab schema comparison in this repository. Keep historical migrations as reference; do not repair production migration history.
8. Run lab-safety tests, TypeScript checking and the application build using only lab credentials, then test proxy blocking and auth redirects in the running app. Credentials must never be printed or committed.
9. Return the commit SHA, schema comparison, check results, and any missing access.

Do not apply the bootstrap to the hosted lab until the disposable restore is verified. No production writes, restart, deployment, credential rotation, outgoing messages or integration activity.
Reference data and sample quotes will be seeded separately. Do not clone production business rows as a shortcut.

## Deployment prerequisites
- Verify runtime environment points exclusively to the lab project.
- Current checks reject known integration environment prefixes and known outbound API paths, with browser connect-src restricted to the lab.
- These application checks are defense in depth, not an OS-level network sandbox or a complete audit of all external-call paths. Standalone scripts do not automatically inherit the Next.js checks.
- Confirm runtime and database functions cannot dispatch real notifications/integrations before hosting.
- Configure the lab OAuth provider and allowed redirect URLs separately. Do not copy production auth users.
