# Quote management

## Behavior
Global settings are starting snapshots for future blank quotes. They include Settings, trade rates, commission and contingency eligibility. Existing quotes, clones and spreadsheet imports keep their own recorded settings. Global changes require the existing create_workspace capability and product access. No access grants are added. Each quote still has Settings.

Project Name and Client Name are mandatory on creation/import. Clone uses the latest saved workbook with its recorded prices, names the copy `<source> CLONE`, and starts Draft. Dates/planning are cleared unless the creator selects the copy option. The source revision history remains intact; the clone begins its own history.

Final currently blocks new workbook revisions until switched back to Draft. Status changes use both the loaded workbook revision and status version to detect conflicts, and are independent of Capacity forecast. Bulk archive uses existing permissions and recoverable archive operations, reports partial failures, and preserves failed selections. Archived quotes have a separate list with restore.

## Hosted setup
Apply only to Supabase project **gkvaeqlqrthztobxitvn** in Mecca Design & Production. Paul approved this exact migration October 11, then requested that Joe perform the hosted setup. Source branch: `codex/quote-management`. Do not use production or replay historical migrations.

1. Sign in at https://supabase.com/dashboard/project/gkvaeqlqrthztobxitvn/sql.
2. Preflight: `select to_regclass('public.lab_quote_settings_revisions'), to_regclass('public.lab_quote_controls');` Both must be null for a first application. If either exists, inspect state before proceeding; do not drop tables.
3. Run the complete `supabase/migrations/20261011120000_lab_quote_management.sql` file once. It is transaction-wrapped. It creates only the named lab tables/functions/policies/trigger and does not rewrite existing quote documents. Do not run db push --include-all.
4. Verify both relations and the functions exist, RLS is enabled, and the workbook Final guard is present. Record application result and timestamp in LAB_STATUS.md.
5. Deploy the reviewed application to the existing mdp-tracker-lab Vercel project only, then check the Git SHA/deployment result independently.

Until the migration exists, existing quote creation/reading/archive continue via compatibility paths; global defaults, cloning and status controls show setup required. Prefer completing migration before deployment. No environment keys or new integrations are required.

## Verification
`npm run lab:check` includes helper, route, pricing, safety, import, capacity and efficiency coverage plus TypeScript. Database test: `PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node --test tests/quote-management-db.test.mjs`. PGlite 0.5.8 was installed only in a disposable temporary directory, not project dependencies. The test uses a minimal representative base schema, actual workbook migration and new management migration; it does not claim the entire historical schema was bootstrapped.

Hosted acceptance still required: mandatory names, create/reopen with global defaults, old quote unchanged, clone/reopen source settings preserved, Draft/Final from both controls, Final save rejection, multi-select archive and restore, dates and last-modified accuracy. Use explicitly named lab test quotes only; do not reprice business quotes or alter shared defaults solely for testing without accounting for other active creators. Verify source revision count and totals stay unchanged.

Local component browser verification passed new default125 vs old/clone110 and required names/status. Bulk archive helper tests pass partial failure, selection and restore semantics; full browser archive verification remains outstanding.
