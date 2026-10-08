# Existing spreadsheet quotes → Tracker Capacity

October 8, 2026: Paul requested importing currently quoted spreadsheet projects, primarily to populate native Capacity. `/quotes/import` is linked from Quotes. No new integration, credentials or database migration is required.

## Current supported scope

Export the complete v27 Google workbook through File → Download → Microsoft Excel (.xlsx), then upload one quote at a time. The browser reads the file locally using the existing XLSX dependency, without executing formulas or fetching external links. Only the normalized quote snapshot is saved to the existing authenticated lab workspace/revision APIs.

Imports the original Settings/trade rates, Materials DB price snapshot, Quote Builder inputs and explicit overrides, and Takeoffs with parent item identities, quantities, units, prices, section multipliers, resale, trade hours and notes. Intermediate blank takeoff rows are retained. Literal computed-price cells become explicit price overrides. It never substitutes current catalog prices. Supported source mapping is the reviewed v27 layout: Quote Builder rows 5–41 and total row 43, Takeoffs rows 5–5004, documented Settings rows, Materials DB rows 5–1004 and 1009–1058.

Each populated takeoff's material and extended-hour output, each quote item's effective inputs/price/budget/hours, and source grand price/build budget must reconcile. Missing cached numbers, duplicate item names, unknown types, unassigned populated takeoffs and shifted/incompatible layouts block the import. These errors need source review; do not silently replace them with zeros or price overrides.

The review shows shop, field, design and per-trade hours. Paul enters/confirms quote title, optional client, build dates, install date and forecast status. Required scheduling fields block saving until entered. Missing trade attribution is explicitly reported. Saved quotes immediately participate in the existing Capacity views, which refresh every 60 seconds or manually. No operational Tracker project, Google write-back or ongoing sync is created.

## Explicit limitations

Detailed Install/Travel/Shipping/beMatrix worksheets are not reconstructed. Their cached outputs stay as Quote Builder inputs; a persistent imported-workbook banner explains this. Keep the source file for those details. Imported field duration uses the longest recorded Installer Days row, preserving concurrent installers rather than stretching summed person-days into a serial job. This remains an estimate from the chosen install date, not a recovered crew schedule. Source schedule/status cells and planning overrides are not inferred. Shared capacity roster persistence still needs its separately documented migration.

Import currently creates a new quote only. Exact file SHA-256 is retained in assumptionsVersion; before creating, all accessible active and archived workspaces are checked for that fingerprint and matching title. This catches sequential repeats, including after edits to the saved quote. It is not an atomic cross-user/cross-device uniqueness guarantee; simultaneous imports or renamed/re-exported copies can still duplicate a job. Quote visibility follows existing memberships. Never claim all company projects are visible without checking access.

Creation and initial revision saving are separate existing API operations. Once an ID is returned, retries reuse it and never overwrite a saved differing revision. Save is reread and compared before reporting success. Unknown creation outcomes stop automatic retry and direct the user to Quotes. Reloading a failed import can leave a blank workspace; inspect/reuse or archive it through normal controls rather than creating duplicates. No quote/history deletion is performed.

## Verification and next source intake

Independent historical extracted fixture verifies original $28,953.192 sell, $11,890.64 build budget, 60 shop hours (44 Carpentry / 12 CNC / 4 Electrical), 40 field hours and 12 design hours; Possible status allocates 30 weighted shop and 20 weighted field hours. Negative cases reject missing formula caches, unmatched parents, unknown types and altered totals. Browser upload uses a disposable XLSX reconstructed from that extraction, not a current business quote. Actual current project exports and the complete project list are still needed for reconciliation and migration. Do not import reference examples as live pipeline jobs.
