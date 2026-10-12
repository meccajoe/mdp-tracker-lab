# Shared Tracker materials catalog

Paul authorized a one-time copy from Google Materials DB on October 11, 2026. Tracker becomes the authoritative selection catalog after activation; no Google writes or ongoing sync. Export CSV is the manual return path to Sheets.

## Activate (Joe)
1. Use only Supabase lab `gkvaeqlqrthztobxitvn`.
2. Check `select to_regclass('public.lab_material_catalog'), to_regclass('public.lab_material_catalog_history'), to_regclass('public.lab_material_catalog_import');`. All must be null; otherwise inspect the existing setup rather than rerunning/dropping it.
3. Apply only `supabase/migrations/20261012010000_lab_materials_catalog.sql` once, wrapped in `begin;` / `commit;`. No historical migration replay or production changes.
4. Open `/quotes/catalog` signed in with quote create permission. Click **Copy Google Sheet DB into Tracker**. Import is atomic and idempotent: repeated requests cannot replace an existing catalog. Source read is fixed to the already-authorized sheet and gid.
5. Confirm expected source count, inspect import notes and complete missing entries. Inspection on October 11 found 700 valid entries plus Z Clips missing unit and cost; all 701 names are retained, and incomplete entries cannot be selected until completed.
6. Test a dedicated draft: manually type a new material name, unit and an explicit cost, then leave the cost cell. It should appear with **Added from Takeoff**. Refresh catalog, change its cost and verify the old quote price remains while a new selection uses the new price. Export CSV and import into a new Google Sheet manually if desired.

## Behavior
- `/quotes/catalog` and the quote's Materials DB tab share a searchable/editable catalog with sortable Name, Unit, Unit cost and Source columns. Export includes every entry, regardless of search/sort, with source and blank incomplete costs. Formula-like text is neutralized for safe spreadsheet opening.
- Initial source is **Google Sheet DB**. New manual takeoff entries are **Added from Takeoff**. Source is immutable. Normalized duplicate names do not overwrite existing unit/cost; explicit catalog editing uses expected revision checks.
- Database keeps historical entry versions. Selection IDs include entry revision. Quote documents retain their own catalog snapshots and overrides; catalog edits never rewrite saved workbooks. Explicit reselection/Use latest price still opts into the latest catalog price.
- Automatic capture only follows user-edited rows, with a name, unit and explicitly entered valid cost (including intentional zero). It does not scrape old quotes or add default blank/zero rows on mount. Catalog failure leaves the quote entry intact and reports a status. Undo of a quote edit does not delete a shared catalog entry.
- Before schema/import setup, existing read-only Google selections remain available with an explicit pending-copy status; automatic catalog writes are off. After initialization, ordinary catalog reads no longer contact Google, including after a Tracker outage. Shared data is protected by actor RLS, active create_workspace capability and lab-only route guard.

## Checks
`npm run lab:check` includes snapshot, export/validation and route source-boundary checks. Disposable PostgreSQL: `PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test tests/tracker-catalog-db.test.mjs` verifies rollback, repeat import, duplicate handling, revision conflicts, history and access denial. Hosted activation is a separate acceptance step.
