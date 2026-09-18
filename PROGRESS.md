# MDP Tracker Progress

## Active workstream

**Accounting Review — Tracker vs. QuickBooks project comparison**

- Owner: Ferris
- Release branch: `release/accounting-review-20260917`
- Feature branch: `ferris/labor-rate-root-cause`
- Live URL: `https://projects.meccadesign.com/admin/reconciliation`
- Release merge: `3b70ce3`

## Deployed behavior

Accounting Review now compares Tracker and QuickBooks at the project level instead of leading with a missing-rate exception queue.

- Tracker revenue: project contract value.
- Tracker project cost: imported project expenses plus approved direct project labor.
- Tracker gross profit: contract value less Tracker project cost.
- QuickBooks revenue, project cost, and profit remain the accounting actuals.
- Differences are presented as QuickBooks minus Tracker.
- Unavailable QBO values remain unavailable rather than being shown as zero.

Approved labor-cost policies:

- Rodrigo L, Marcelo T, and Mariam H: `$41/hour` fixed design cost.
- Adam Gonzalez: `$375` per distinct worked project day.
- Paul M. Mecca and Emily D Kuhl: salaried hours remain visible but are excluded from direct project cost because their compensation falls below gross profit.

These policies change reconciliation valuation only. They do not rewrite historical QBO Time source rows.

## Production rollout

- Feature implementation commit: `02b3d8a`.
- Release merge commit: `3b70ce3`.
- Both branches were pushed to GitHub.
- Migration `20260918100000_labor_rate_integrity.sql` was applied directly through `supabase db query --linked` to avoid applying unrelated historical local-only migrations.
- Production schema verification confirmed:
  - `labor_rate_imports` exists;
  - `labor_worker_rate_authority` exists;
  - `labor_worker_cost_policies` exists with six active policy rows;
  - `project_labor_reconciliation_summary.excluded_project_cost_hours` exists.
- Migration history was repaired only after schema verification; local and remote now both record `20260918100000` as applied.
- Payroll workbook SHA-256 `610f84a5f2022735e61daa0da21cf2f708516a4c16caac38d0d50fba6cbf040b` was hash-confirmed and imported under Joe Mecca's approval.
- Production import manifest: `dbd1c580-841b-4491-ba0f-1b4366933c3b`.
- Exact read-back confirmed `76` authority records and the three contractor-designer classifications.
- PM2 app `mdp-tracker` was restarted with `--update-env` from `/Users/archie/projects/mdp-tracker`.

## Verification

- Full regression: `623/623` tests passed.
- TypeScript passed.
- `git diff --check` passed.
- Production build passed all `52/52` static pages.
- Disposable PostgreSQL migration/policy harness passed.
- Production post-import audit:
  - projects with labor: `136`;
  - total hours: `54,232.00`;
  - verified direct-cost hours: `54,209.42`;
  - salaried hours excluded from direct project cost: `22.58`;
  - missing-rate hours: `0`;
  - verified direct wages: `$1,433,051.01`.
- Local login route: HTTP `200`.
- Public login route: HTTP `200`.
- Public Accounting Review route: HTTP `200`; unauthenticated browser correctly redirected to Google sign-in.
- PM2 read-back confirmed `mdp-tracker` online after restart.

## Remaining maintenance

Historical Supabase migration drift still exists outside this release. Do not run a broad `supabase db push --include-all`. Audit each local-only migration against production schema and classify it as already present, genuinely missing, or obsolete before repairing history. Also move non-SQL contract tests out of `supabase/migrations` and resolve the duplicate `20260812170000` migration version.

## Safety boundary

- QBO remains authoritative for accounting income, cost, profit, and margin.
- Tracker labor authority affects operational direct-project-cost evidence only.
- No QBO transaction or QBO Time source row was mutated.
- No broad Accounting Review scan or case-generation mutation was run during rollout.
