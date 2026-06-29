# MDP Materials DB — IRL Test Checklist

## Goal
Run the first real workbook preview inside MDP Tracker and confirm the materials admin flow is ready for operator testing before any live cutover.

## Pre-reqs
1. Local `mdp-tracker` app is running.
2. Local / target Supabase DB has the materials migration applied:
   - `supabase/migrations/20260629124500_materials_catalog.sql`
3. You can sign into MDP Tracker as an admin user.
4. You have an exported workbook file on the same machine the app server is running on.

## Workbook export
Google Sheets export URL:
- `https://docs.google.com/spreadsheets/d/1ywIwkdwo4GmjCK7VSXTE3RC7INjSa-WKWP8Lp7Ek88g/export?format=xlsx`

Example local download path:
- `/Users/archie/Downloads/materials.xlsx`

## What the parser should now see from the real workbook
Dry-run parse on 2026-06-29 produced:
- total rows: `708`
- `MATERIAL DATA BASE`: `246`
- `Wood`: `249`
- `MetalAluminum`: `101`
- `Graphics`: `27`
- `Packaging Material`: `85`

If preview totals are dramatically lower than that, the parser/regression is broken.

## Critical fixes already included before this test
1. Real workbook column alignment is now fixed for:
   - `Wood`
   - `MetalAluminum`
   - `Packaging Material`
2. `Wood` now handles both:
   - left-side main rows
   - right-side side-list rows
3. Import batch row loading now supports pagination so large review queues are testable:
   - preview returns the first row page plus counts
   - batch detail route supports `limit` / `offset`
   - UI supports `Show More Rows`

## IRL test flow
1. Open `MDP Tracker`.
2. Go to `Settings -> Materials`.
3. Confirm these routes work:
   - `/admin/materials`
   - `/admin/materials/import`
4. On the import page, paste the absolute workbook path.
5. Click `Preview Import`.
6. Confirm the summary looks sane:
   - total row count roughly matches `708`
   - all 5 sheets show non-zero rows
   - `Wood`, `MetalAluminum`, and `Packaging Material` are no longer near-zero
7. Review queue checks:
   - filter to `Needs Review`
   - verify ambiguous / incomplete rows appear with review reasons
   - use `Show More Rows` and confirm later staged rows load
   - save / approve / skip at least one row each
8. Batch history checks:
   - confirm the new preview appears in `Import Batch History`
   - reopen the batch from history
   - confirm row state persists
9. Commit checks:
   - only commit after unresolved review rows are handled
   - confirm commit summary shows imported / deduped / skipped counts
10. Post-commit checks:
   - search for a few known materials under `/admin/materials`
   - open a detail page
   - verify vendor price rows, aliases, and audit history exist

## Good first spot checks
Search for:
- `Birch Baltic`
- `MDF`
- `Aluminum U-Channel`
- `Double Sided Carpet Tape`
- `Rapid Tac`

## Likely real-world follow-ups after this test
If operator testing shows friction, the next most likely additions are:
- bulk approve / bulk skip for review rows
- stronger review filters
- export unresolved review rows
- matcher tuning based on real ambiguous rows
- final cutover checklist before freezing spreadsheet edits
