# Daily Tracker V2 project sync

Joe approved daily sync at **6:00 a.m. America/Chicago**, including existing linked projects and newly Closed Won Active Lab quotes. The actor-checked admin panel in Projects provides Preview sync, Run sync now and run history. See LAB_STATUS.md for current deployment and activation receipts.

## Authority and identity

| Information | Authority | Behavior |
| --- | --- | --- |
| Name and job number | Linked HubSpot deal | Mirror exact canonical values after conflict checks |
| PM, close/due dates, CRM amount, associated quote references | HubSpot | Explicit property mapping and established approved PM aliases; reference amounts stay separate from Lab budgets |
| Budget, quoted hours and item allocation | Pinned Lab quote revision | New projects pin the approved saved head revision; existing budgets never silently reprice |
| Active/completed state | Current linked Lab quote head | Preserve existing quote-driven status projection; ignore conflicting Production status |
| Expenses, canonical time and approved costing | Production Tracker during transition | Full, validated, dated read-only exports; atomic activity + costing publication only in Lab |

New-project discovery excludes open and already completed quotes. Existing linked project history remains available after completion. Use stable deal/job/group identifiers, never name-only matching. Missing or conflicting links remain exceptions; no duplicate project, quote or accounting record is created. The head rule is newest surviving workspace creation, selected as the tie-breaker, not the largest revision across unrelated workspaces.

Quotes, Capacity, personal scenarios, working quote documents and pinned financial baselines remain owned by Paul. Current approved PM mapping includes Nicholas/Nick Gonzales and Destiny Freeman/Gardner; unknown or ambiguous names fail closed.

## Data path and privileges

The only source database transport is Supabase Management API `/database/query/read-only` for Production `yaftybqzlbbvzwwdzlny`, using `LAB_TRACKER_READ_TOKEN` scoped only to that project with Database Read. HubSpot uses the dedicated server-only `LAB_HUBSPOT_READ_TOKEN`, with deal and quote read scopes. No Production credentials were copied and no source roles, permissions, functions or data changed.

The approved costing view and worker-matching SQL body are separately hash-checked. The read-only role lacks EXECUTE on `normalize_labor_worker_name`, so the export embeds that exact reviewed scalar SQL expression. It does not guess matching rules or broaden source permissions. New evidence records its worker-rule hash. Rule drift, incomplete rows, unsupported manual adjustments and failed reads stop that project’s import.

Lab-only migrations create private run/outcome tables and service-only invoker RPCs. Global six-minute leases prevent overlap; max invocation is 300 seconds, with no new source requests after 240 seconds. Three projects run concurrently. Creation checks the current quote head/revision, canonical identity and uniqueness under locks. Activity and matching cost evidence save in one transaction. Retries within a run are no-ops; prior captures and original quote titles remain retained. Expired/finished/preview runs cannot publish captures.

Preview writes only the run log. A project failure keeps its last good capture. Other projects continue; a run with expected exceptions is marked partial. Missing rates remain unknown costs, including on otherwise successful imports. Authenticated clients cannot call server sync RPCs, read global run tables or dispatch scheduled jobs; the admin API authorizes the actor first.

## Scheduler

Lab uses **Supabase pg_cron + pg_net** to call the fixed HTTPS Lab endpoint. Vercel Hobby cron has [per-hour delivery precision](https://vercel.com/docs/cron-jobs/usage-and-pricing), so root `vercel.json` retains its empty cron array. The obsolete Vercel-only cron template was removed.

The named job `mdp-lab-project-sync` runs `0 11,12 * * *` UTC. Private `lab_project_internal.dispatch_project_sync()` checks Chicago’s hour and dispatches only during 06:00, handling daylight saving automatically. The server independently checks its actual Chicago clock. The scheduled daily claim prevents duplicate publications.

The dispatcher is SECURITY INVOKER, callable only by its database owner, with no browser/application EXECUTE grants. It reads a dedicated Lab Vault secret named `lab_project_sync_cron` and sends it as a bearer credential. The same private value is configured as Lab Vercel `CRON_SECRET`; source read tokens are not copied into Vault. URL and 300,000ms timeout are fixed in code. Credentials never appear in cron command text or Git. Initial migration stages the job inactive until deployment and transport verification.

Required app flag: `LAB_DAILY_SYNC_ENABLED=true`. The database job’s `active` value is the scheduling source of truth. Manual admin sync remains available independent of recurrence.

### Operations

- Pause immediately in Lab SQL: `select cron.alter_job(job_id := (select jobid from cron.job where jobname='mdp-lab-project-sync'), active := false);`. Also set the app flag false and redeploy when appropriate.
- Resume only after verifying source access and recent outcomes, then set that job active with the matching app flag deployed.
- Inspect `cron.job` and `cron.job_run_details` for trigger status. pg_net responses are in `net._http_response` for roughly six hours; application outcomes persist in `lab_project_sync_runs` and `lab_project_sync_results`.
- On failure, retain last good data, fix the connection/link/rule exception and rerun manually. Do not guess rates or merge reversed worker names.
- Rotate the dedicated Lab cron credential privately in Vault and Vercel together; redeploy before reenabling the job. Do not print/pull source credentials or put them in CLI arguments.

## Verification

The first successful hosted preview was `c7cbef90-cacd-4e4f-99f1-4714d2296ed6`. Joe’s authenticated manual run `5a344729-d6a4-440a-8475-7427beac515d` refreshed all **12 linked projects**, with only two missing-link exceptions (Advent_FSU_v27 v3 and Rock n Roll Denim v2). Partial describes those skipped quotes, not failed linked-project imports.

Independent reconciliation confirmed exactly one new full activity capture and cost packet per linked project, agreement with preview counts/hours/costs, current quote-driven statuses, unchanged pinned revisions/budget hashes/totals, and retained original Fossil history (13 total captures afterward). Ten projects have complete labor coverage; Fossil 41.78h and Whatnot 25.48h remain genuine missing-rate exceptions.

363 combined tests + TypeScript and sanitized build passed for the source correction. Restricted-role SQL tests prove matching parity for 20 worker cases while direct custom-function execution stays denied; a single-statement Fossil comparison matched all 228 cost records exactly. Source exports across all 12 projects passed runtime validation. Desktop/mobile real-component sync controls and protected page checks passed.

Scheduler logic is tested in a disposable database with Vault/pg_net/cron fixtures (the external extensions are not installed locally). Tests cover inactive staging, target/auth/timeout, winter/summer and DST transition dates, denied client/application invocation and missing credentials. Hosted extension interfaces and the authenticated HTTP response are verified before activation. First timed execution is a future event; do not describe configuration/manual verification as an already completed scheduled run.
