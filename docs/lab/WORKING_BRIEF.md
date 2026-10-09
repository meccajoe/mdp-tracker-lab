# Paul's quote and capacity workspace

## Goal
Paul can describe changes to Codex, build and deploy them to a persistent sandbox, and iterate independently. Joe reviews production promotion. Paul joins development before the new quote workspace is finished.

## Product starting point

October 8 import repair: Paul supplied BDNY v27, Fossil Christmas v27 and Solis Table 2 v21 after import failures. Treat the remaining approximately ten spreadsheet quotes as a migration bridge, not an ongoing Sheets integration. Preserve readable data on the import page, resolve missing descriptions/settings or parent links explicitly before saving, and keep strict source price/budget/hour reconciliation. Harmless unused item labels belong in retained notes, not fatal errors. Support the verified v21 layout with pinned recorded labor rate and separate PM fee; do not invent wages or reprice old estimates. See SPREADSHEET_IMPORT.md for source evidence and limits.

October 8: Paul needs existing spreadsheet quotes imported to Quote Builder and native Capacity, prioritizing all currently quoted projects appearing in the schedule. Build a reviewable import with recorded prices, item/trade hours, dates/status, duplicate checks and preserved revisions. Current project source list is pending. Initial v27 XLSX support/limitations are documented in SPREADSHEET_IMPORT.md; it is not an ongoing Google sync or full estimator-detail migration.

October 7 clarification supersedes unconditional Delete: selected cells clear as a whole, while typing/double-click/F2 permits character editing. Item Name drag-fill assigns rows to the existing source item; it must not rename destination items. Quote Builder needs an undoable Clear item control. Keep the workbook frame/header/tabs and selection-sum footer visible while sheet contents scroll.

October 6 direction: four Standard/Premium/Rush/Lower Budget pricing presets initialized from Standard; Takeoffs overtime percentage at 1.5× for that portion; dollar formatting; reliable native selections, Item click/drag behavior, Unit dropdown and full-cell Delete. Prequote items must have their own searchable, editable library, explicit Save as reusable on both Takeoffs/Quote Builder, and insert into next empty item/rows. Shared preset and overtime scope/price rules plus calculated-cell clearing are pending Paul’s answers. Do not silently reprice existing snapshots. See PREQUOTE_LIBRARY.md for independent library setup; earlier quote-linked reusable-storage design is superseded.

Latest capacity request (October 5): quote header shows workspace name and calendar install/build-start/build-finish dates. Materials search Up wraps to bottom; Tab goes down, Shift+Tab up. All saved web quotes feed a native Capacity section, following current v5 sheet (1M1Wmk4ZPGQhu8kVLfXFRh8tp_hrHp7EQMJxkDj9ps_M). Capacity scope is now authorized; earlier upcoming labels are superseded. Preserve pricing, snapshot history and membership boundaries. Shared roster setup and allocation/source-roster questions remain pending; see CAPACITY_TRACKER.md. No Google write-back or operational project creation is implied.

Latest October 5 direction supersedes automatic default-item assignment and earlier removal of row deletion: unused Takeoffs rows must keep Item #/name empty until Paul assigns or drag-fills them. Search opens only after typing; Materials & Labor narrower, Notes wider. New quotes open directly ready to edit. Source tabs are exposed separately; labor/travel use compact vertical source layout, Settings values sit beside parameters and accept blank editing. Legacy Decoder/Capacity scope question is pending; tabs are explicitly upcoming, not implemented. Preserve old assigned rows and quote price snapshots.

October 5 usability batch: rename Description to Materials & Labor with direct in-cell search and keyboard results; learn frequent catalog choices across saved accessible quotes. Autosave changed drafts every 60 seconds. Reusable items are explicitly designated with Save as reusable item (Paul confirmed); insertion uses current inventory prices, leaving source quotes unchanged. Remove Trade/delete controls from Takeoffs but preserve existing data. Add rows into existing item groups, full-window workspace, drag-copy, arrow navigation, selection sums, and distinct service colors. Dermalogica's beMatrix Wall 1 was unlinked, not a missing SEG pricing formula; do not change its saved business estimate without directing the link appropriately.

October 5 worksheet clarification: all item takeoffs stay on one page by default, like Paul’s 12:00 screen recording. No top-level working-item toggle. Assign/name rows inline; an optional Filter items button searches item number or name and isolates a selected item, with Show all items to restore the full worksheet. Filtered editing must never overwrite hidden rows. This supersedes earlier requests for a working-item toolbar.

October 5 item-identity clarification: Paul needs separate Item # and editable Item name columns directly in Takeoffs (Item 1 = Golden Arch, Item 2 = Cabinet Fixture), repeated on every related material/labor row. Item numbers follow the stored quote-line order and internal links remain stable IDs. Choosing an item on a row makes it the default for new rows without reassigning existing ones. Names belong to quote items, not individual takeoff descriptions, and must persist for eventual team/project handoff. Production budget shows both number and name; automatic workbook-to-project conversion remains separate unfinished work.

October 5, 2026: Undo/Redo should reverse and restore successive quote edits across all tabs, one completed field edit or bulk operation per action. History is shared across tabs (100 most recent session actions), retained when saving, reset when loading/reopening a workbook, and a new edit clears redo. Saved revisions are a separate persistent history. Takeoff line-item controls should show understandable item names only, in Quote Builder order, with assignment distinct from renaming.

October 4 follow-up: populated Takeoffs reference 1COzb0eiQ1zvPb_1vF58dYSTgTC7vSPw0ap6XnCHkL0E, gid 1132319826, and Paul's screenshot clarify the item-building workflow. Each named quote item comprises multiple material and labor rows, with the same parent item name on each row. All items stay on one sheet; provide visible description dropdowns for materials and labor, free typing, a working-item selector/name editor, and the screenshot's compact column layout. Reference values are examples, not a request to import or reprice Paul's saved quotes.

October 4, 2026: Takeoffs should open with 50 ready-to-type rows, adding 50 more on request. Match the reference Takeoffs tab (gid 1132319826): Line item, Description (free text/catalog lookup), Qty, Unit, Unit cost, Section multiplier, Resale, Material total, Labor hours, Extended hours, Notes; retain Trade for capacity attribution. Paul explicitly authorized live read-only Materials DB sheet 1Z34DH5kc3c7K9g-yOUyzF_sEhhNPFZeIdfh1gMTNL-0, gid 1318845246. New choices must refresh without deployment. Default pending further direction: existing row prices stay recorded, new selections use live prices, and an explicit selected-row action adopts a new price. Saved revisions must never change on catalog refresh. Paul reports workspace permission was granted by Joe and works. Cloud development setup is deferred at Paul's request; this local task still depends on its Mac staying awake.

UI direction (September 30, 2026): use compact text, soft section/tab colors, pale editable fields and distinct calculated outputs throughout. Takeoffs is one continuous worksheet across all quote items. Support literal drag-fill down/up a column, range copy/paste and undo while retaining stable item/catalog/trade links and nullable overrides. No pricing-rule change authorized. Blank template remains the new-quote reference.

Rates UI preference (September 30, 2026): Paul wants the original sheet's readable sections instead of a dense card grid. Group settings by purpose, align parameter/value/notes rows, show percent symbols with human-entered percentages (5 means 5%), dollar signs for money, and × for multipliers. Keep stored fractions, price math, manual overrides and saved snapshots unchanged.

Paul's first requested change (September 29, 2026): make the website quote builder resemble his blank spreadsheet template. Use https://docs.google.com/spreadsheets/d/1Wbnlz1Th3zC2nKgBBFJUjZw4lGotF_4Z8Tqd6O-xkhM/edit?gid=2071081838 as the layout and new-quote starting reference, disregarding Fonroche sample data for this work. Signed-in template inspection completed; the Quote Builder sheet is gid 1358146786. First implementation matches its A–X column sequence, yellow entry cells, dark headers, service rows and project economics. New drafts use independently extracted blank-template settings/catalog and zero estimates. The app requires named, typed rows, so the 15 item and seven spare rows default to Fabrication; the start screen explains this. Existing quotes/revisions retain their snapshots. Historical fixtures remain solely as calculation regression checks; no pricing engine change was requested.
Use a spreadsheet-like editable workflow: takeoffs, material catalog lookups, quantities and section multipliers, trade labor, pricing, explicit overrides, client quote, and production budget.
Preserve calculated values separately from overrides, with restore-to-calculated behavior.
Use stable IDs for items/trades instead of exact-name joins. Version material/rate assumptions per quote revision.
The old quote spec does not dictate the new user experience.

## Reference attachments
Reviewed snapshots: Fonroche_v27_Mecca_Quote_Builder.xlsx and Mecca_Capacity_Tracker_v5.xlsx. Original workbooks remain attachments. A reproducible Fonroche input/catalog snapshot and source hash are now in tests/fixtures/quote-v27/fonroche.json; see V27_CALCULATOR.md for implemented behavior and limits. Do not invent missing workbook inputs from summary totals.
The capacity workbook is work in progress.

## Fonroche comparison case
Saved workbook outputs:
- Client quote: $28,953.192 before display rounding ($28,953.19 displayed).
- Production build budget: $11,890.64.
- Shop hours: 60 = carpentry 44 + CNC 12 + electrical 4.
- Internal field hours: 40. Design hours: 12.
- Build window: October 15–30, 2026.
- Quote status: Possible, 50%; planning override: Not likely, 25%.
Reproduce inputs and outputs, then record intentional differences agreed with Paul. This single case is not proof that all pricing rules are correct.

## Capacity starting point
Roster with primary trade, secondary skills, and weekly availability. Separate committed, weighted pipeline, and selected full-job scenarios.
A project winning must move demand from pipeline to committed without double-counting.
Keep quote status and planning override separate, with clear/reset behavior.
Use remaining-work estimates for active production, retaining the quoted baseline.
Separate field dates from shop build dates. Account for design demand.
Secondary skill capacity is shared person availability, not extra hours.

## Known workbook issues to address explicitly
The weekly formula allocates seven days to every overlapping week, overstating partial weeks. Fonroche at the planning override should total 15 weighted shop hours; the formula allocates 19.6875 across three weeks. Choose calendar/workday distribution with Paul; either must preserve total demand.
Trade-hour handoff and efficiency-adjusted allowed hours may diverge when efficiency differs from 1. Reconcile them explicitly.
Trade definitions should cover the live catalog instead of hardcoding only the workbook's current columns.

## First acceptance loop
Recreate Fonroche; alter quantity, cost, labor and price override; save/reopen; verify quote and budget changes; feed trade hours into capacity; move dates and status; verify totals and no duplication.
Then let Paul change the workflow through Codex. Do not expand into a full scheduling system before this loop works.
