# Paul's quote and capacity workspace

## Goal
Paul can describe changes to Codex, build and deploy them to a persistent sandbox, and iterate independently. Joe reviews production promotion. Paul joins development before the new quote workspace is finished.

## Product starting point

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
