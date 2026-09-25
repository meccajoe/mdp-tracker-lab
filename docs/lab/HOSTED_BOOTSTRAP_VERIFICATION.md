# Hosted lab bootstrap verification — 2026-09-25

Target: gkvaeqlqrthztobxitvn, mdp-tracker-lab, Mecca Design & Production.
Source: yaftybqzlbbvzwwdzlny, inspected read-only.
Reviewed repository commit: a1922554a965f197149d9dfdcbfaafe023b775f9.
Original bootstrap SHA-256: f8386097977de3a56245b237612d02ad1cf8025558337f877631418d5b9489e3.

## Applied to hosted lab
1. lab_production_public_schema_bootstrap: original reviewed schema-only SQL.
2. lab_restore_explicit_source_grants: remove target-default grants to PUBLIC/anon/authenticated/service_role, then replay explicit source grants.
3. lab_qualify_uuid_defaults: qualify 59 UUID defaults as pg_catalog.gen_random_uuid().

The original bootstrap is preserved unchanged. When restoring another hosted lab, execute the original bootstrap and both correction files in order, preferably in one transaction so intermediate grants are not exposed. Never apply the disposable auth prelude.

## Why corrections were needed
The hosted target applied default object/function grants that were absent from the disposable local role stubs. Original export revoked PUBLIC function execution but did not first remove the target's explicit default grants to anon/authenticated/service_role. The correction restores exact source ACL semantics.
The target also resolved unqualified gen_random_uuid() defaults to the extensions implementation because of export search_path. Source defaults use the pg_catalog implementation. Qualification restores exact references.

## Verified results
- Real managed auth.users, auth.uid(), auth.jwt() and anon/authenticated/service_role exist.
- 75 public tables, 3 views, 54 functions, 60 policies, 75 RLS-enabled tables.
- All 75 tables report zero rows after schema-only operations.
- Hosted source signatures: 1,722; hosted lab signatures: 1,722.
- Missing: 0. Extra: 0.
- Source and lab comparison used tools/lab/schema_signatures.sql with psql-only metacommands removed.
- Direct privilege checks: anon/authenticated cannot execute claim_integration_outbox or import_labor_rate_authority; create_quote_workspace is authenticated-only.
- No production mutations, business-row copies, application deployment or auth-user creation.

## Remaining gates
Schema parity is not security approval or runtime authentication verification.
Supabase advisors now report inherited source characteristics:
- 2 owner-privilege views: project_summary and project_pricing_index.
- 9 mutable function search paths.
- 2 anonymously executable SECURITY DEFINER routines.
- 20 authenticated-executable SECURITY DEFINER routines (inspect intended authorization).
- 20 tables with RLS and no policies (deny-by-default client access; service paths may be intentional).

Review/fix relevant view and function exposure before loading business samples and opening the app to users. Preserve intended server-only access; do not add permissive RLS policies simply to remove advisory messages.
Remediation references:
https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view
https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

Next: dedicated Vercel configuration, lab-only secrets, Google auth configuration, real Joe/Paul login and RLS tests, then approved sample data.
