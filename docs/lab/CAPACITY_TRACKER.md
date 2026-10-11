# Native lab capacity tracker

## Item timelines and actual completion — October 11
Paul confirmed parallel item schedules inside the existing stage windows. Graphics shares Finish/Paint’s 20% window and is separately itemized when quoted. No seventh stage or percentage change. Click a timeline stage to expand all quoted line items; Choose quoted item displays its own timeline on the same date axis. Untouched zero template slots are omitted, while items with quoted values, takeoffs or actual dates remain visible.

Stage hours now use the saved quote baseline, not remaining-hour overrides: item takeoff extended hours identify CNC/carpentry/paint/graphics/packing by exact trade mapping. Dedicated CAD and Stage/Pack/Prep lines use their allowed hours once. Shared CAD hours are not assigned across fabrication items. Unknown trades, untyped hours and overallocations remain explicit on item detail. Working days are elapsed stage duration; quoted person-days = stage labor / saved shopDay, with zero shopDay flagged rather than divided. No crew size, holiday, or sequential item scheduling is inferred. Current planning overrides still appear separately.

Optional `productionProgress` stores `{stages: {stageId: ISODate}, items: {lineId: {stageId: ISODate}}}` in the existing workbook revision. Supported stage IDs include graphics as a Finish subtask. Empty dates remove entries; valid range 1900–2200 follows existing schedule policy. Project and item completion are independently entered; no automatic stage closure, hours reduction or status transition. Graphics has its own Actual date when quoted. Quote editing permissions and expectedVersion conflicts remain mandatory, including archived read-only behavior. Previous quote revisions are never updated. Clear item removes its actual dates; reusable-item snapshots omit project progress and calendar.

Local component verification includes expansion, direct item menu, mirrored date fields, save/refresh and unchanged quoted hours; regression tests cover extended hours, CAD no-double-counting, graphics, override mismatch disclosure, snapshot validation, old snapshots, clearing and reusable export. Future Final locking integration must keep operational completion updates possible without enabling commercial repricing; pending branches are not merged as part of this work.

## Per-project timelines and workweeks — October 11
Each project name in overall Capacity opens `/capacity/[workspaceId]`; the quote header and Capacity tab link to the same page. It reads only that quote’s latest saved revision under existing membership checks, with visible-only 60-second refresh paused while weekend choices are unsaved. Missing dates/saved quote produce a clear setup message.

Paul approved default weekdays plus independent **Saturday work necessary** and **Sunday work necessary** toggles for each project. An explicit Save workweek appends the complete existing workbook with optional `productionCalendar: {saturday:boolean,sunday:boolean}` under the existing edit rights and expectedVersion check. A stale-save conflict retains choices; no business data is overwritten and no new database migration is required. Old snapshots without the field remain byte-schema compatible and default to weekdays. The legacy global `settings.allocation` field still parses for compatibility, but no longer controls production; its UI selector is replaced by per-project workweek guidance.

Timeline shares are CAD/Drawings15%, Purchasing/Production Ramp Up5%, CNC10%, Carpentry/Assembly40%, Finish/Paint20%, Final Prep/Packing10%. Apply them to the inclusive enabled days between quote Build start and Build finish, using fractional days to avoid dropping stages on short jobs. Install is a separate dated milestone. Enabling weekends changes stage boundaries inside the same build dates; it does not move install/build finish or increase quoted hours. Target milestones stay separate from manually tracked Actual completion dates. Holidays are not inferred.

Overall weekly shop demand and trades distribute across each project’s enabled workdays while preserving totals. Stage percentages do not divide labor, and the overall weekly load is not redistributed by stage. Stage details now use quoted design and item-level named trade hours; remaining trade overrides stay in the separate planning totals. Unrecognized/untyped hours remain separate; no hours are invented for Purchasing. Field installation remains calendar-based on the install estimate (or the existing explicit build-window mode). Weekend toggles never increase roster capacity or apply overtime pricing.

Tests cover 20-day exact dates/shares, four weekend combinations, one-day/weekend-only/missing/inverted dates, DST, persisted calendar validation, protected latest-revision reads, independent weekly distribution, baseline pricing preservation and trade mapping. Local UI verifies toggle/save/refresh. No operational Tracker project is auto-created or linked; these pages follow the existing quote-driven Capacity project list.

Pending unrelated branches: `codex/quote-management` and dependent `codex/cad-turnover`. When integrating, retain calendar/snapshot compatibility and revision conflict checks. New clones must clear job-specific completion dates. Their Final read-only control is reused via the workbook read route; operational Actual updates will need a narrowly scoped path that preserves Final commercial immutability.

Reference read October 5, 2026: Mecca_Capacity_Tracker_v5, spreadsheet `1M1Wmk4ZPGQhu8kVLfXFRh8tp_hrHp7EQMJxkDj9ps_M`. Read native metadata plus bounded Roster & Settings, Projects, Shop Load, Field Load ranges and allocation formulas. This is a native lab implementation, not a Google Sheets write-back or ongoing roster integration.

## Data and formulas
- `/capacity`, sidebar Capacity, Projects capacity section, and quote Capacity handoff link expose the four source sections.
- Every accessible non-archived quote workspace appears automatically; latest saved workbook supplies schedule and demand. List pagination prevents the previous 100-workspace cap truncating capacity. Refresh occurs every 60 seconds while open, and manually. Unsaved quotes/changes cannot contribute saved demand. Quotes outside a user's existing membership remain inaccessible.
- Optional `schedule` in quote snapshots stores installDate/buildStart/buildFinish/status. Empty dates/status remain visible and flagged; no guessed business dates. Date fields participate in Undo/Redo and autosave. Dates are UTC calendar dates for allocation; build finish must not precede start.
- Shop demand follows the source Capacity export: Fabrication, Graphics, beMatrix/SEG, Stage/Pack/Prep, Disposal, Props/Resale allowed hours. Field demand follows Installer Days rows (internal installers, excluding subcontract support); design is separate. Existing pricing and price overrides are unchanged.
- Per-trade hours retain explicit trade IDs. Rows without trade IDs use only exact, unique case-insensitive matches of labor description to saved trade name. Unattributed hours remain Untyped. If summed trade hours exceed allowed shop hours, flag the mismatch instead of silently scaling estimates.
- Source status probabilities: Not likely 25%, Possible 50%, Likely 75%, Highly likely 90%, Closed won/In production 100%, Lost/Completed 0%. Missing status is flagged and excluded. Committed and weighted pipeline are separate; scenario checkboxes replace selected pipeline probability with 100%, never add the same job twice.
- Planning overrides (`planning` in a new quote revision) separately record remaining shop/field/trade hours, status and notes. Clear to restore quote-derived demand. Saved quote prices and underlying labor estimates are preserved. Workbook membership and revision conflicts govern edits.
- Weekly roster capacity counts active primary trades once. Secondary skills show shared flex capacity, not additive blended hours. I&D feeds field; I&D, Driver/Pickups, Facility are excluded from blended shop. Hourly rates are reference only.
- 26 Monday-based weeks, expected/committed utilization, amber >85%, red >100%, and trade load rows. Source partial-week formula overcounts by allocating seven days to every overlapping week. Native exact overlapping-day allocation preserves total hours, including DST boundaries and partial weeks; hours outside the displayed horizon remain outside it.
- Allocation options are explicit. Initial draft defaults are weekdays for shop and install date + longest estimated internal-installer duration (calendar days) for field. Calendar-day shop and source-style build-window field distribution are available. Paul's preference questions remain pending; these defaults are not recorded business-rule approval. Field distribution is an estimate, not an individual crew assignment, and does not infer a separate dismantle date.
- Roster starts empty. Do not copy source personnel/rates to Git. Source roster import awaits Paul's answer; no roster imported during this implementation.

## Shared settings database prerequisite

Apply **only** `supabase/migrations/20261005193000_lab_capacity_settings.sql` to lab Supabase project **gkvaeqlqrthztobxitvn**. Never replay historical migrations or run `db push --include-all`. This creates one append-only roster/settings table, policies and sequence trigger. It does not change any existing quote revision or project.

As of implementation, the dashboard was signed out and no database CLI/session was available. Hosted application remains pending Joe's application of this exact file or a signed-in lab admin session. Without it, quote scheduling/demand/planning work through existing storage; roster editing is disabled with an explicit setup message.

Read access is restricted to existing quote-product identities; append additionally requires the existing active create_workspace capability for the actor. Anonymous access, spoofed authors, unauthorized writes, service-role writes, updates/deletes and stale/skipped revisions are rejected. No new identity is granted access. Settings saves use expectedVersion; a conflict retains the draft.

Disposable PostgreSQL verification:
```
PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test tests/capacity-db.test.mjs
```
`npm run lab:check` covers quote/schedule/capacity math and validation plus TypeScript. Hosted acceptance still must verify settings revision 1, reopen, second-device visibility and conflict behavior after the migration is applied. Use test-only roster entries then remove them through a new revision; never overwrite business roster data.

## Boundaries

This is quote-driven capacity planning. It does not automatically create operational Tracker project records, sync QBO actuals, import Google-only quotes, infer crew assignments or promote business production. Existing project/commercial integration remains Joe's boundary. The old Legacy Decoder quote tab remains upcoming.

## Hosted acceptance, October 5
Feature commit 22ffcad deployed successfully. Dedicated lab quote d33f7c70-4fb5-4df2-92e0-2106a1351a24 saved schedule/trade demand as revision 3, automatically appeared in all four capacity views, then received a separate Completed planning override in revision 4 to remove test demand. Date reopening and weighted shop/field allocation passed. Shared roster migration remains unapplied and the UI correctly disables its saving. Native calendar popup inspection could not complete; manual/date input persistence passed. Business quotes were only read by the capacity listing, never modified.
