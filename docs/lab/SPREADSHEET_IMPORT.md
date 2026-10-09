# Existing spreadsheet quotes → Tracker Capacity

October 8, 2026: Paul requested importing currently quoted spreadsheet projects, primarily to populate native Capacity. `/quotes/import` is linked from Quotes. No new integration, credentials or database migration is required.

## Current supported scope

Export the complete v27 or supported v21 Google workbook through File → Download → Microsoft Excel (.xlsx), then upload one quote at a time. The browser reads the file locally using the existing XLSX dependency, without executing formulas or fetching external links. Only the normalized quote snapshot is saved to the existing authenticated lab workspace/revision APIs.

Imports the original Settings/trade rates, Materials DB price snapshot, Quote Builder inputs and explicit overrides, and Takeoffs with parent item identities, quantities, units, prices, section multipliers, resale, trade hours and notes. Intermediate blank takeoff rows are retained. Literal computed-price cells become explicit price overrides. It never substitutes current catalog prices. Supported source mapping is the reviewed v27 layout: Quote Builder rows 5–41 and total row 43, Takeoffs rows 5–5004, documented Settings rows, Materials DB rows 5–1004 and 1009–1058.

Each populated takeoff's material and extended-hour output, each quote item's effective inputs/price/budget/hours, and source grand price/build budget must reconcile. A correction form retains the parsed upload and lists missing settings, missing material descriptions and unmatched parent names together. Users explicitly supply missing values or choose an existing uniquely named parent; edits apply to a copy and must still reconcile with untouched cached totals. Changing a correction invalidates the preview. Blank unused item labels are retained in Notes with an audit warning. Nonzero cached material/hour totals cannot use that blank-row path. Duplicate item names, unavailable formula results, unknown types and incompatible layouts still block saving; do not silently replace them with zeros or price overrides. Corrections and compatibility notices persist in optional validated importNotes and are visible when reopening the quote.

The review shows shop, field, design and per-trade hours. Paul enters/confirms quote title, optional client, build dates, install date and forecast status. Required scheduling fields block saving until entered. Missing trade attribution is explicitly reported. Saved quotes immediately participate in the existing Capacity views, which refresh every 60 seconds or manually. No operational Tracker project, Google write-back or ongoing sync is created.

## Explicit limitations

Detailed Install/Travel/Shipping/beMatrix worksheets are not reconstructed. Their cached outputs stay as Quote Builder inputs; a persistent imported-workbook banner explains this. Keep the source file for those details. Imported field duration uses the longest recorded Installer Days row, preserving concurrent installers rather than stretching summed person-days into a serial job. This remains an estimate from the chosen install date, not a recovered crew schedule. Source schedule/status cells and planning overrides are not inferred. Shared capacity roster persistence still needs its separately documented migration.

Import currently creates a new quote only. Exact file SHA-256 is retained in assumptionsVersion; before creating, all accessible active and archived workspaces are checked for that fingerprint and matching title. This catches sequential repeats, including after edits to the saved quote. It is not an atomic cross-user/cross-device uniqueness guarantee; simultaneous imports or renamed/re-exported copies can still duplicate a job. Quote visibility follows existing memberships. Never claim all company projects are visible without checking access.

Creation and initial revision saving are separate existing API operations. Once an ID is returned, retries reuse it and never overwrite a saved differing revision. Save is reread and compared before reporting success. Unknown creation outcomes stop automatic retry and direct the user to Quotes. Reloading a failed import can leave a blank workspace; inspect/reuse or archive it through normal controls rather than creating duplicates. No quote/history deletion is performed.

## Verification and next source intake

Independent historical extracted fixture verifies original $28,953.192 sell, $11,890.64 build budget, 60 shop hours (44 Carpentry / 12 CNC / 4 Electrical), 40 field hours and 12 design hours; Possible status allocates 30 weighted shop and 20 weighted field hours. Negative cases reject missing formula caches, unmatched parents, unknown types and altered totals. Browser upload uses a disposable XLSX reconstructed from that extraction, not a current business quote. Three current project exports have now been checked below; the complete migration list is still needed. Do not import reference examples as live pipeline jobs.


## October 8 source-specific repair verification

Read-only exports supplied by Paul (original sheets unchanged):

| Source | Spreadsheet ID | Price | Shop / field / design hours |
| --- | --- | ---: | --- |
| BDNY 2026 V2 v27 | 1zETGkL3b-uIKU-c_wbYGZMH6PoDx-9WNRyZeKIoVoc4 | $128,885.6808 | 412 / 60 / 36 |
| Fossil Christmas v3 v27 | 1G-1VEoKPOqLa0QQwuiW32kI9s7FWCPpbCebAh0pGgnc | $95,066.8304 | 331 / 20 / 24 |
| Solis Table 2 v21 | 1NvRLk1dbDYAlX1YYbxPRmWsh41bsr6yFxwxVMNHwI0I | $33,430.2272 | 184 / 0 / 16 |

BDNY row 86 has only the unused Soldier Lights label; it now imports into Notes. Its 240 stage/pack hours have no source trade assignment and remain explicitly untyped shop demand. Fossil row 5 has quantity 1, unit cost $4,000 and material total $4,000 but no description; typing Container in the correction form preserves all amounts. Unused Round Pedestals labels are also retained as notes. Source documents are never edited by the correction form.

Solis has the verified older layout: rows 5–50, subtotal 52, separate PM fee 53 and grand total 54, with the Settings notice that PM is not a line type. This exact structural signature enables compatibility; generic shifted templates are not claimed. B7 is pinned to its recorded rate ($41 in Solis); the absent B64 multiplier uses a neutral 1 that is inactive under the pinned rate. Trade names come from nonzero labor takeoffs with null wages, preserving Tile Install and Upholstery Labor without inventing wage assumptions. Legacy hired support site days × crew are translated into person-days and their rate-card charge, still checked against every source budget/price. Separate PM sell is an explicit price override; nonzero separate PM costs are unsupported. Solis's administrative PM hours are not classified as shop/field demand, consistent with native Capacity. No calculator pricing branch changed.

All three full exported files pass item input/output, takeoff totals, quote total and budget reconciliation, original-file immutability and saved-document parser round-trip checks. Exports remain temporary local files, not committed business data. Added regressions cover blank labels versus nonzero totals, required corrections, explicit zero, failed reconciliation, audit-note round trips and the legacy layout. Local browser tested actual Fossil upload, missing-description blocking, correction preview with unchanged total/hours, simulated failed-save retry and verified readback using isolated memory storage. Hosted verification is recorded in LAB_STATUS.md.
