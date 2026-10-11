# CAD Turnover

## Scope and behavior
Paul requested an item-level CAD instructions/BOM PDF when a quote is marked Final, downloadable from the main Quotes page. Implementation is on `codex/cad-turnover`, based on `codex/quote-management` at 8ec8b33. The original pending branch is unchanged. Nothing is deployed to the primary lab URL yet.

The status API reads the requested immutable workbook revision, derives a deterministic scope summary and renders a PDF on the server. It uses recorded material descriptions, quantity times sections, unit overrides, notes, trade hours, effective quote labor allowances and linked beMatrix wall calculations. No live catalog, AI service or third-party integration is called. Dollar prices/margins are omitted. Takeoff detail is not silently rescaled to match manual quote input overrides or efficiency changes; discrepancies, imported limitations and unassigned rows are disclosed. beMatrix counts are estimating allowances; no frame sizes/connectors or graphic sides are invented for legacy totals.

The PDF bytes and Final transition commit in one database transaction. A rendering/storage/version conflict leaves the existing status unchanged. Stored PDFs are append-only, tied to both workbook revision and status version, and readable only by active quote members. Returning to Draft hides the link; re-finalization stores a new PDF and retains earlier artifacts. The download route serves the stored file, not a live regeneration, with no-store headers and attachment disposition. Renaming a finalized quote does not rewrite its historical PDF. Archived Final quotes retain downloads through existing member access. Clones start Draft and do not copy Final artifacts.

Legacy Final statuses with no PDF return a visible instruction to switch Draft and Final again. The original `set_lab_quote_status` RPC remains compatible with the earlier branch; direct callers of that older RPC do not create a PDF. The web app routes Final through the new atomic RPC.

## Joe: apply in order, lab only
1. Confirm Supabase **gkvaeqlqrthztobxitvn**, organization Mecca Design & Production.
2. Apply `20261011120000_lab_quote_management.sql` using its existing instructions, if not already applied. Do not replay it if the relations exist.
3. Run `select to_regclass('public.lab_cad_turnovers');` - it must be null for initial application. If present, inspect existing migration state; do not drop or overwrite it.
4. Run the complete `supabase/migrations/20261011140000_lab_cad_turnover.sql` once. It is transaction-wrapped, adds a private append-only artifact table and authenticated finalization RPC, and does not rewrite saved quotes. Do not run all historical migrations or db push --include-all.
5. Confirm the table has RLS enabled and `finalize_lab_quote_with_cad(uuid,integer,integer,text,text,text)` exists. Record completion in LAB_STATUS.md.
6. Merge reviewed `codex/cad-turnover` into lab main after setup. It includes the prior quote-management work; a separate prior merge is not necessary. Deploy only mdp-tracker-lab in Meccanics.

## Verification and dependencies
`npm run lab:check` covers CAD content, original pricing regressions, routes, PDF pagination and TypeScript. The existing disposable PostgreSQL management test also applies the new migration and checks invalid-PDF rollback, exact revision association, re-finalization history, unauthorized reads/writes and Final edit locking. Run with `PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test tests/quote-management-db.test.mjs`. No historical bootstrap against the live database is used.

Pinned pdf-lib 1.17.1 and @pdf-lib/fontkit 1.1.1 generate PDFs without external services. Liberation Sans regular/bold and their license are included under src/assets/cad-fonts; Next output tracing includes these server-only font files. Rendering caps at 250 pages / 6 MB. Unavailable font glyphs are explicitly rendered as U+ codepoint labels instead of silently removed. The illustrative sample uses Paul's three examples, not a saved business quote.

Hosted checks still required after Joe's migrations: Final from list/header; download/reopen exact stored PDF; old quote revision untouched; Draft hides download; edited/re-finalized quote yields new PDF; membership denial; archive/restore; fonts included in deployed function. Test on named lab fixtures only.
