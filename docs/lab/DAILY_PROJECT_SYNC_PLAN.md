# Daily Tracker V2 project sync

Agreed November 12, 2026: include existing linked projects and newly Closed Won Active Lab quotes; run daily at 6:00 a.m. America/Chicago. This is a design and implementation scope, not an enabled schedule. No recurring sync or source connection was created by the costing release.

## Source ownership

| Information | Authority | Sync behavior |
| --- | --- | --- |
| Project name and job number | Linked HubSpot deal | Mirror exact values after identity/conflict checks |
| PM, close date and other approved CRM reference fields | Linked HubSpot deal / verified property mappings | Extend current identity-only refresh with explicit mappings; do not guess field names or overwrite populated values from failed reads |
| Budget, quoted hours and item allocation | Approved Lab quote baseline | Pin the selected workspace/revision when creating a project; later working revisions do not silently change an existing budget |
| Active/completed state | Linked Lab quote state | Preserve existing quote-driven status behavior; do not import conflicting Production status |
| Expenses, canonical time and approved direct labor costing | Production Tracker during transition | Read only, validate, and save one matching full activity/costing capture per project/run |

Open quotes remain outside project creation. Already completed quotes do not trigger a historical bulk import. Existing linked projects retain history when completed. Quotes and Capacity workflows, scenarios, estimates and pricing remain owned by Paul.

## Project selection and identity

Refresh existing reviewed links. Discover newly Closed Won Active quote groups and create one project from the selected version. Use stable HubSpot deal ID plus job number, workspace/group identity and uniqueness constraints; never match on project name alone. A missing job/deal, duplicate association, ambiguous quote group or conflicting existing link goes to an exception list. Similar or reversed worker names do not establish identity.

Project creation must be repeatable without duplicates. Baseline capture, project linkage and initial quote-driven status belong in one transaction. Confirm the existing selected-version/head rules rather than choosing the largest revision number across workspaces.

## Daily activity import

1. Obtain the allowlisted Lab project scope and newly eligible quote links.
2. Read approved HubSpot fields through the narrow read-only connection. The current manual refresh reads only name/job; PM and other fields need implementation and mapping validation.
3. Obtain full expenses, canonical time and corresponding approved costing evidence using a dedicated least-privilege read-only source export. Do not place Production service-role credentials in Lab or enable inherited accounting/TSheets/BILL integration routes.
4. Validate source identity, completeness, unique IDs, dated approvals and reconciliation totals. Publish activity and its matching costing packet together, avoiding a window where a new activity capture appears without its cost evidence.
5. Record run/project outcomes, source timestamps, capture IDs, counts, totals and exceptions. Retain immutable history and use explicit run/project idempotency keys for retries.

A source/read/validation failure retains the last good capture and marks that project's refresh failed/stale; it must not masquerade as zero activity or delete history. Other independent projects can continue, with the whole run marked partial. Genuine missing pay rates remain explicit exceptions rather than guessed amounts. Handle source corrections/deletions via a validated full later capture.

## Scheduling and acceptance

Implement an authenticated application job with overlap protection, bounded work/retries and a persistent run log. Preserve America/Chicago 6:00 a.m. through daylight saving changes. Existing Lab vercel.json has no crons and inherited integration routes are blocked; simply turning those routes on is outside this design.

Before enabling recurrence: implement and review the scoped source connection and atomic importer, run manually with a preview/diff, validate new-project creation and retry idempotency, confirm source identities and quote baselines, test partial failure/changed links, and verify last successful sync visibility. Never create a ChatGPT reminder and describe it as a functioning data pipeline.

## Implemented November 12

The dedicated Lab implementation now includes:

- Actor-checked admin preview/apply/history API at `/api/lab-project-sync`, and a bearer-authenticated scheduled endpoint at `/api/lab-project-sync/scheduled`.
- A private Projects/Dashboard sync panel with preview, manual run, the latest ten runs and latest-run outcomes. Nonadmins cannot read global logs or invoke the job.
- Service-only RPCs for scope, six-minute global fenced run claims, per-project atomic application and completion. The invocation is capped at 300 seconds; it starts no new project work after 240 seconds. Three projects run concurrently. Finished/expired/preview runs cannot publish captures. A scheduled completed/partial day is deduplicated; manual retries are explicit.
- New project creation from the existing current quote-group-head rule, pinned saved revision and unchanged calculator. Repeat calls within a run are no-ops. Existing budgets, source hashes and quote documents remain unchanged. Pre-link quote titles are preserved before canonical HubSpot names reach the group.
- Identity/job/revision/group checks under locks, plus atomically inserted full activity and matching costing evidence. Missing links, manual actual adjustments, changed costing rules, unknown PM mappings, truncated CRM quote associations and incomplete exports fail closed with sanitized codes.
- HubSpot name/job/PM/close/due/amount and associated quote references read directly. The established `account_manager`, `closedate`, and `due_date` fields are used. Nulls are distinguished from absent requested fields. Reference amounts do not replace Lab quote budgets.
- Production reads only through Supabase's dedicated `/database/query/read-only` Management API endpoint, using the built-in read-only role. No Production functions, roles, grants or data changed. No accounting/TSheets/BILL sync routes enabled. No dependency upgrades.

Migrations `20261112215251` and `20261112220832` were applied only to Lab after disposable database tests. The existing source baseline SHA is retained on refresh. New baseline hashes cover the calculated financial snapshot; source metadata/identity history remain separate appended provenance, consistent with existing baselines.

### Required configuration and activation

`LAB_HUBSPOT_READ_TOKEN` already exists in Lab Production. It must read the requested deals and associated quotes; the live preview will surface a per-project error if quote permissions are missing. No credential values were retrieved.

Create a new [Supabase scoped access token](https://supabase.com/dashboard/account/tokens) for **only** Production project `yaftybqzlbbvzwwdzlny`, granting **Database Read** (`database_read`) only. Save it as server-only `LAB_TRACKER_READ_TOKEN` in **mdp-tracker-lab**, Vercel **Production** environment. Scoped tokens start `sbp_fc`. Do not use a Production service-role key or a legacy full-account PAT, and do not post the token in chat. [Supabase read-only endpoint and required permission](https://supabase.com/docs/reference/api/v1-read-only-query).

A new random 256-bit `CRON_SECRET` was created privately for Lab Production. `LAB_DAILY_SYNC_ENABLED=false` is explicitly set. No secrets were printed/pulled, no recurring task exists, and root `vercel.json` retains its empty cron array.

After the source token is saved and the code is deployed with that configuration:

1. Sign into Lab as an administrator. Open Projects → Project sync → Preview sync. Inspect every outcome. Preview writes the run log only, without changing projects, quote budgets or activity.
2. Run the manual apply, then independently compare identities, baseline hashes, expense/time/cost totals and retained history. Repeating must preserve one project/link per source identity. Genuine missing rates remain pending.
3. Set `LAB_DAILY_SYNC_ENABLED=true` and apply the reviewed cron configuration from `docs/lab/project-sync-vercel-crons.json` to root `vercel.json`; deploy and verify the Vercel job. That schedule invokes at 11:00/12:00 UTC; the authenticated handler runs only during Chicago's 06:00 hour, preserving 6 a.m. through DST. The database claim prevents duplicate scheduled daily publications.
4. Verify the first scheduled run and private per-project outcomes. Failed projects retain the last good capture; missing costs never become zero.

### Verification and remaining boundary

341 tests and TypeScript plus a sanitized Node 24 webpack build passed. Four disposable database suites cover row-lock privileges, new-project creation, full rollback, idempotent retries, immutable financial baselines, original title preservation, run overlap/expiry, scheduled deduplication, preview denial and client access denial. Hosted Lab service-role scope/claim/finish passed inside a rollback-only transaction. Global run-log tables intentionally have RLS with no client policies; the actor-checked admin API reads them through its Lab server role.

The actual new full source-export query read Fossil in a single snapshot: 35 expenses, 228 time rows, 528.97h, 13845.56 approved direct labor, 41.78h unresolved. Runtime costing validation passed on that export. This was a read-only source probe, not a replacement of the saved Lab activity. Private source exports remain outside Git. Token-backed hosted preview/apply and scheduled execution are still pending source configuration. Local vet could not download its tokenizer due DNS; no external private-code upload.

After incorporating Paul’s latest account-timer release, all 344 combined tests and TypeScript passed. Desktop/mobile real-component tests passed for preview/apply controls, exceptions and directory refresh; the full project UI regression and protected Quotes/Capacity rendering also passed without JavaScript errors. The source token remains absent by name-only Vercel verification.

Publication boundary: automatic approval review rejected pushing this separate implementation to main/its feature branch without explicit release approval. The implementation is committed locally; no sync interface deployment occurred. Lab schema and disabled configuration are staged, but live preview/apply and schedule activation cannot proceed until publication and the source-token setup are complete.

Joe subsequently saved LAB_TRACKER_READ_TOKEN (confirmed by name in Lab Production) and explicitly approved pushing the sync release. The earlier publication block is resolved. His configuration redeploy still served old main 6c04881. The source token value was not retrieved; token-backed preview/apply remains the next verification after this code release. Latest main 887c18d was merged with 348 combined tests and TypeScript passing.
