# Native lab capacity tracker

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
