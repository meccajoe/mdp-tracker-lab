# Dynamic production scheduling — first release

Paul approved proposed-until-approved schedules and fixed quoted deadlines with explicit shortage flags on October 12, 2026. This replaces the fixed-percentage allocation for detailed shop forecasting. The 15/5/10/40/20/10 reference and its earlier completion records remain available in a collapsed section.

## Behavior

Every saved quote with dates and labor produces an item/trade proposal when viewed. No quote data or prices are rewritten. Shared CAD precedes a configurable purchasing wait, then each item's CNC, carpentry, finish/graphics and packing tasks. Missing trades are skipped; finish and graphics run together when both are quoted. Different items overlap across trades. Full-task prerequisites are editable. Partial-batch release and global resource leveling are not yet implemented.

Primary roster hours divided by five supply daily availability. Secondary skills never add capacity. Each task defaults to at most one quoted shop day of crew-hours daily; adjust crew size where justified. Missing staffing is an explicit timing assumption, not verified capacity. Weekend switches change eligible project days, not weekly staff budgets. No holidays are inferred.

Dates outside the quoted finish remain visible as shortages. Earliest dates, waiting days, remaining work and locked start/finish are explicit overrides. Recalculation is previewed/applied, returns to Proposed, and never replaces the first approved baseline. Save separately to share a proposal or approval. Approval does not reserve employees across competing projects. Forecast status/probability still controls committed/weighted/full views.

Capacity uses saved schedule daily shop demand or the generated proposal. CAD and field work stay separate. Project remaining-hour overrides take precedence; reconcile these with task overrides. Zero remaining hours create no phantom dates. A completion date alone does not zero remaining work. Quote revisions, prices, prior schedules and first baseline remain intact.

Actual completed, optional actual hours, delay reason and notes support baseline variance review and CSV export. Tune assumptions manually using multiple comparable jobs. There is no hidden automatic learning. Guidebook: `/capacity/guidebook`.

## Shared storage activation

**Applied and verified October 13, 2026** in lab project gkvaeqlqrthztobxitvn through Paul’s signed-in dashboard. Migration history is recorded. Hosted schedule save, approval, actuals and reload passed on the dedicated test quote. The roster also loads persisted data. The steps below are retained as deployment history; do not rerun the migration.

### Original activation steps

1. Pull the latest **meccajoe/mdp-tracker-lab** main branch.
2. Open Supabase SQL Editor for **gkvaeqlqrthztobxitvn** only.
3. Run the complete file `supabase/migrations/20261012180000_lab_production_schedules.sql` in a transaction. Apply this migration once; do not replay historical migrations or run `db push --include-all`.
4. Confirm `public.lab_production_schedule_revisions` exists with RLS enabled. It is an append-only operational table, not a quote rewrite. Existing allowlisted workspace members can read; owner/editor/reviewer can append. Archived workspaces cannot append.
5. In Tracker Lab, open a dedicated test quote's Capacity page. Save a proposal, reopen it, approve/save, record an actual completion and reopen again. Check a second signed-in device sees the same schedule revision. Verify a Final quote can save operational progress without changing its quote revision or prices.
6. Try a stale save from two tabs: the second must report a conflict and retain its local draft. Do not overwrite customer test data.

Shared schedule saving, approval and actual persistence are now enabled. Earlier capacity settings storage is present and the existing roster was verified without alteration.

## Verification

- `npm run lab:check`: planner invariants, quotes/capacity regression suites, route access/error handling and TypeScript.
- `PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test tests/production-plan-db.test.mjs`: disposable database only; membership/RLS, append sequencing, stale conflict, protected baseline, archived/anonymous restrictions. Never targets hosted data.
- Local actual-component synthetic adapter verifies proposed → approved → saved, actual completion and hours, measured variance and recalculation.
- Production webpack build uses lab-only placeholder keys; hosted deploy and storage activation are separate checks.
