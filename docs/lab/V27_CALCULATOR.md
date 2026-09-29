# v27 calculation foundation

The first implementation is `src/lib/quote-v27.ts`, a pure calculation engine with no network or database access. It now powers the Quote builder tab and append-only workbook draft revisions. Capacity UI and the legacy commercial review/publication model remain separate.

## Source and comparison

`tests/fixtures/quote-v27/fonroche.json` is a read-only extraction of the approved `01-Fonroche_v27_Mecca_Quote_Builder.xlsx` attachment, SHA-256 `122e4d6bbc6d1faef3c00063913486251676147edb5488324b782a8bb1819ffa`. It contains 18 typed quote lines, 13 populated takeoff rows, 698 cached catalog entries, 11 named trades, settings, source-cell mappings, and independently cached workbook outputs. The source workbook remains an attachment; the fixture is reproducible with `scripts/lab/extract-v27-fixture.py` and openpyxl. This script targets the reviewed layout, not arbitrary workbook uploads.

All 18 line outputs match the saved workbook for final price, material budget, allowed hours, labor budget, build budget, contingency, indirect levy, and margin. Totals reproduce $28,953.192 sell, $11,890.64 build budget, and 112 hours: 60 shop, 40 internal field/travel, 12 design. The trade split is 44 carpentry, 12 CNC, and 4 electrical hours.

## Preserved behavior

- Takeoff quantities and labor multiply by the section count; blank means one and explicit zero means zero.
- Material lookup uses stable IDs after extraction. The snapshot freezes rates and catalog assumptions; no live Google Sheet is queried. Workbook name matching is confined to extraction, using the first exact catalog match like VLOOKUP.
- Calculated inputs and prices remain separate from nullable overrides. Zero is a valid override; null restores calculation. Renaming a line, material, or trade does not break links.
- All 20 workbook line types have calculation branches. Materials use a 2.08 multiplier, resale a 1.6 multiplier, and travel/freight a 60% addition in this snapshot.
- Fabrication sell uses entered hours, or days times shop-day hours when entered hours are zero. Efficiency affects allowed task hours only; it never changes days or sell hours.
- Labor cost uses the rounded average burdened rate ($39.27), as the workbook does, rather than pricing each trade at its individual wage. Rate pinning remains an explicit override.
- Commission divides computed line prices by one minus the rate. The PM fee uses final hard-scope prices, excluding travel expenses, freight, and itself; it is not grossed up a second time.
- Calculations retain precision until display, except the workbook's two-decimal blended labor rate.

## Discovered override and intentional representation difference

Fonroche `Quote Builder!N36` contains the literal **1250**, replacing the PM formula even though the label still says auto. The blank v27 template contains `Settings!B23 * final hard scope` at N36. The engine therefore stores $1,250 as an explicit price override while retaining the calculated fee of $647.49576. Final sell and budget match Fonroche; the calculated total is $28,350.68776, making the $602.50424 manual adjustment visible. Restoring calculated pricing intentionally changes the final total. This is not a proposal to remove Paul's override.

## Deliberate limits of this slice

The beMatrix, install, travel, and shipping estimators currently enter as frozen upstream values with source-cell/formula provenance. Their interactive estimator forms and full upstream recalculation are not implemented here. The editor/API/disposable-PostgreSQL integration test verifies save/reopen for quantity, cost, labor and price overrides. Hosted save/reopen under a real Google session remains unverified.

Named trade hours remain the quoted takeoff baseline when efficiency or an hours override changes allowed hours. The result includes untyped hours and an overallocated-trade warning rather than silently rescaling the trade mix. Capacity distribution and the known partial-week allocation issue remain separate follow-up work.

## Verification

Run `node --experimental-strip-types --test tests/quote-v27.test.mjs` on Node 24 (the lab runtime). Thirteen tests cover every pricing branch, line-by-line Fonroche comparison, quantity/section changes, catalog cost edits, labor changes, renames, zero and cleared overrides, PM scope, commission, efficiency, serialization, immutability, and invalid numeric/reference inputs.

## Editor and persistence

The default Quote builder tab supports item/takeoff editing, catalog lookup and custom unit costs, section multipliers, trade hours, input and price overrides with restoration, rate assumptions, client quote preview, production budget, JSON draft download, and the last 20 saved revisions. Loading an older revision makes an unsaved draft; saving appends a new revision. Switching workspace or leaving the page warns about unsaved edits. Workbook data stays mounted when switching to the existing Workspace or Review tab.

`quote_workbook_revisions` is separate from commercial quote revisions. Each row contains the full assumptions/catalog/input snapshot and engine version. The authenticated actor inserts through row-level security. Active owners, editors and reviewers can append; active members including viewers can read; archived workspaces are read-only. The server product allowlist is still enforced. An invoker trigger serializes appends per workspace and rejects stale or skipped revision numbers. Clients cannot update or delete rows. No service-key insert bypass or live outbound integration was added.

Migration: `supabase/migrations/20260929012605_lab_quote_workbook_revisions.sql`, applied only to gkvaeqlqrthztobxitvn. Hosted catalog verification confirms RLS, two policies, no anonymous read and no authenticated update/delete grants. No new security advisor finding references the table or trigger; pre-existing findings remain.

Runtime template `src/data/quote-v27-fonroche.json` excludes one unused whitespace-only catalog row (697 usable entries). The source comparison fixture remains unchanged at 698 rows. The extraction script reproduces both.

Additional checks: strict TypeScript for the component/API and dependencies; two request-validation tests; disposable PostgreSQL RLS/history tests for owner/editor/viewer/outsider/removed-member/email-mismatch/archived access, stale/skipped revisions, spoofed authors, and denied update/delete; a temporary JSDOM integration harness exercising the actual editor, API handlers, and PostgreSQL through a test adapter. Authentication and Next response plumbing were stubbed only in that local harness. The hosted app uses its existing verified-user authorization helpers.

Local Chromium was unavailable and its download returned an invalid archive, so desktop/mobile visual QA is not claimed. Cloud browser navigation reaches the real lab login page; no Google session is available there.

Run the added checks with `node --import tsx --test tests/quote-v27-validation.test.ts`. For database tests, provide a local PGlite install via `PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node --test tests/quote-workbook-db.test.mjs`. PGlite is a test-only external dependency; app dependencies and lockfile are unchanged.

## Next implementation

Verify the deployed editor with a real lab account: Quotes → New quote → name it Fonroche comparison → Use Fonroche example → Save revision. Change quantity/cost/labor/price override, save, reload, and inspect both previews. This requires the user's Google session; no hosted business data was seeded by the agent. Then replace frozen upstream values with editable estimators and feed reconciled hours into capacity. Keep commercial approval/publication separate until an explicit mapping into its revision model is defined.
