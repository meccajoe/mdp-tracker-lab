# MDP WIP Reporting Spec

> **For Hermes:** This is a product/spec document first, not an implementation start. Use it to drive a later TDD implementation plan.

**Goal:** Add an admin-only WIP reporting surface inside MDP Tracker so Mecca Design and Venturity can review/export project-level WIP data in a format that mirrors the Venturity workbook while staying grounded in MDP Tracker’s live project data.

**Architecture:** Keep WIP reporting inside MDP Tracker as a new admin-only Reports section. Reuse existing `projects` data wherever possible, add a small set of accounting-specific fields where the current schema has gaps, and build the report as a filterable/exportable table rather than a disconnected spreadsheet clone. Do not overfit the product to a single Excel sheet; instead create a normalized WIP layer that can power CSV/XLSX exports and future month-end snapshots.

**Tech Stack:** Next.js app router, Supabase/Postgres, existing `projects` + computed budget data, admin-only sidebar/nav patterns already used in `/admin/*` pages.

---

## Source document intake

Venturity provided one workbook sheet:
- `2026 Job List`

Visible requested columns from the template:
1. `Customer`
2. `Project #`
3. `Project Name`
4. `Class`
5. `Job Nickname`
6. `Contract Date`
7. `Contract Amount`
8. `Estimated Cost`
9. `Sales Tax Included`
10. `Completion Date`

Workbook note:
- the sheet appears to be mostly a column template, not a pre-filled calculation workbook
- there is a standalone `Complete` label near the top, but no structured `% complete` data column appears in the sheet XML
- treat the column list above as the authoritative requested output until Venturity provides formulas or sample filled rows

---

## Operator truth

This feature serves a different operator than the day-to-day PM workflow.

### Primary users
- **Venturity / accounting partner**
  - wants a clean WIP export/reporting surface
  - cares about contract values, estimated costs, completion timing, and accounting classification fields
- **MDP admin users**
  - will maintain missing accounting metadata
  - need to review and export reports without opening raw project edit screens one by one

### What MDP Tracker already does well
- project-level contract amounts, PMs, statuses, and job numbers exist
- budget totals and category-level estimate/budget logic already exist
- admin-only routing/sidebar patterns already exist
- CSV-like tabular data is a natural fit for the current product structure

### What is missing today
- no dedicated `Reports` section
- no accounting-specific WIP screen
- no explicit WIP metadata fields for `Class`, `Job Nickname`, `Contract Date`, `Sales Tax Included`
- no explicit admin workflow for maintaining those WIP-only fields in one place
- no current export layer targeted at accounting/reporting use cases
- no frozen month-end WIP snapshot model

### Product implication
This should not be treated as “just another spreadsheet export.”
It is a small reporting subsystem with:
- shared live project data
- a few accounting-specific metadata fields
- admin-only maintenance
- export-first output
- likely future month-end snapshot needs

---

## Current data model vs Venturity template

### Existing data that already maps cleanly
| Venturity column | Current source | Notes |
|---|---|---|
| Customer | `projects.client` | Ready now |
| Project # | `projects.job_number` with fallback `projects.id` | Prefer `job_number` in report output |
| Project Name | `projects.name` | Ready now |
| Contract Amount | `projects.contract_amount` | Ready now |
| Completion Date | likely `projects.close_date` | Needs semantic confirmation |
| Active/Completed filtering | `projects.status` | Already present |

### Existing data that can probably power the report, but needs a product rule
| Venturity column | Candidate source | Open rule |
|---|---|---|
| Estimated Cost | derived from existing total budget / quote model | decide whether derived value is enough or whether manual override is needed |

### Missing data that needs explicit product support
| Venturity column | Proposed field | Why |
|---|---|---|
| Class | `projects.wip_class` | Do not overload `project_type`; accounting class is likely different |
| Job Nickname | `projects.job_nickname` | Distinct short/internal label |
| Contract Date | `projects.contract_date` | Existing `close_date` / `due_date` are not the same concept |
| Sales Tax Included | `projects.sales_tax_included` boolean | Needed for report/export, currently absent |

---

## Recommended product scope

## 1) New admin-only Reports section
Add a new top-level admin-only nav section separate from Settings.

### Sidebar / IA
Recommended new nav item:
- `Reports`
  - `WIP`

Recommended route shape:
- `/reports/wip`

Alternative if we want to keep admin routing clustered:
- `/admin/reports/wip`

Recommendation:
- use `/reports/wip` only if we expect non-settings reporting to grow
- use `/admin/reports/wip` if we want to keep admin-only surfaces consolidated right now

Given the current app structure, **`/admin/reports/wip` is the lower-friction MVP choice**.

---

## 2) WIP report screen
The WIP screen should be a filterable table, not a raw spreadsheet clone.

### Table columns (initial)
In this order:
1. Customer
2. Project #
3. Project Name
4. Class
5. Job Nickname
6. Contract Date
7. Contract Amount
8. Estimated Cost
9. Sales Tax Included
10. Completion Date
11. Status
12. PM
13. Estimate Source (hidden by default or admin-only detail)

### Why include Status and PM even though they are not in the template
They help the internal admin users audit/filter the report without leaving the page.
They can be excluded from the exported default template if Venturity wants a stricter spreadsheet match.

---

## 3) Filters
Venturity asked for date/status filtering. Minimum filter set should be:

### Required filters
- Status
  - Active
  - Completed
  - On Hold
  - Pending
  - All
- PM
- Customer
- Contract Date range
- Completion Date range
- Sales Tax Included
  - Yes
  - No
  - All

### Strongly recommended filters
- Class
- Missing WIP metadata
  - missing class
  - missing contract date
  - missing estimated cost
  - missing completion date
- Search
  - customer / project # / project name / nickname

### As-of reporting
Add an `As of date` filter placeholder in the spec, but define behavior carefully:
- if no snapshot system exists yet, `As of date` can only filter by stored contract/completion dates, not reconstruct historical WIP state
- if Venturity needs true period-end WIP by date, we will need snapshots (see snapshots section)

---

## 4) Estimated Cost rule
This is the key product decision.

### Recommended rule
Use a two-layer model:

#### Layer A — default estimated cost
`estimated_cost` defaults to the project’s current total estimated budget from the tracker’s existing budget model.

Candidate source:
- existing computed `total_budget`
- or an explicit budget-sum helper already used in project summary views

#### Layer B — optional admin override
Allow admin to set:
- `projects.estimated_cost_override`

Displayed report value becomes:
- `COALESCE(estimated_cost_override, derived_total_budget)`

Also expose:
- `estimated_cost_source`
  - `derived`
  - `manual_override`

### Why this is the best fit
- uses existing estimator/budget logic immediately
- avoids forcing accounting to accept an operational estimate when they need a reporting adjustment
- keeps the report auditable

### Do not do this
- do not make Estimated Cost purely manual from day one unless Venturity explicitly rejects the tracker-derived estimate
- do not silently write a derived estimate back into the project record as if it were manual user input

---

## 5) Recommended schema additions
Add these fields to `projects`:

```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_date date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS job_nickname text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS wip_class text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sales_tax_included boolean;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS estimated_cost_override numeric(12,2);
```

Optional but recommended for auditability:

```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS wip_notes text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS wip_updated_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS wip_updated_by text;
```

### Reuse vs rename guidance
- keep `close_date` as-is in schema for now
- surface it in the report as `Completion Date` **only if existing usage truly means completed/closed date**
- if MDP currently uses `close_date` more like a target close rather than actual completion, add a new explicit `completion_date` field instead of overloading semantics

This needs confirmation before implementation.

---

## 6) Data entry / maintenance workflow
Admins need a way to maintain the new WIP fields without editing every project through the full project form.

### Recommended MVP maintenance pattern
Option A — add WIP fields to existing project edit screen
- lowest engineering cost
- keeps one source of truth

Option B — add a lightweight admin grid editor inside the WIP report
- better ops UX for accounting cleanup
- more work, but much better for bulk metadata maintenance

### Recommendation
For MVP:
- add WIP fields to project edit
- add inline quick-edit from the report for the most important fields later

Minimum editable WIP fields:
- Class
- Job Nickname
- Contract Date
- Sales Tax Included
- Estimated Cost Override
- Completion Date (if not already correctly represented)

---

## 7) Export requirements
Venturity explicitly needs export.

### MVP export buttons
- `Export CSV`
- `Export Excel`

### Export behavior
- export respects current filter state
- export column order matches the Venturity template
- date formatting should be human-readable, not ISO timestamps
- currency columns should export as numeric currency-friendly values
- boolean `Sales Tax Included` should export as `Yes/No`

### File naming
Recommended:
- `mdp-wip-report-YYYY-MM-DD.csv`
- `mdp-wip-report-YYYY-MM-DD.xlsx`

Optional if filtered:
- `mdp-wip-report-active-YYYY-MM-DD.csv`
- `mdp-wip-report-completed-YYYY-MM-DD.xlsx`

### Export implementation note
CSV is trivial and should be non-negotiable in MVP.
Excel export can be implemented with a lightweight XLSX library if needed.
If timeline gets tight, CSV first and XLSX second is acceptable technically, but the requested spec should still treat both as desired output formats.

---

## 8) Month-end snapshot question
This is the biggest strategic requirement to clarify.

### Why it matters
Accounting WIP is often period-end sensitive.
If Venturity wants to know:
- “What did WIP look like on May 31?”
then a live current-state report is not enough.

### Recommendation
Call this out explicitly in the spec now.

#### MVP option
- current-state report only
- export current filtered view
- no historical freeze

#### Better accounting-ready option
Add snapshot support:
- `wip_report_snapshots`
- `wip_report_snapshot_rows`

Where an admin can:
- choose `As of date`
- generate a frozen snapshot
- export that frozen snapshot later unchanged

### Recommendation
Do **not** build snapshots blindly before confirmation.
But do treat this as the first follow-up question for Venturity because it changes architecture meaningfully.

---

## 9) Security / permissions
The user already specified this should be admin-only.

### Required permission model
- Reports section visible only to admin users
- export actions admin-only
- WIP field editing admin-only

### PM/non-admin behavior
- no Reports nav
- no direct access to WIP report route
- no accidental export visibility

This should follow the same admin gating model already used in:
- `/admin/users`
- `/admin/settings`
- `/admin/reconciliation`
- `Sidebar.tsx` `effectiveIsAdmin` logic

---

## 10) Recommended implementation phases

### Phase 1 — data foundation
- add new WIP fields to `projects`
- confirm whether `close_date` can safely power `Completion Date`
- define derived estimated-cost helper + override rule

### Phase 2 — admin report page
- add `/admin/reports/wip`
- filter bar
- table view
- CSV export

### Phase 3 — Excel export + polish
- XLSX export
- empty-state / missing-metadata audit UX
- optional quick-edit affordances

### Phase 4 — optional accounting hardening
- snapshot/freeze model
- saved report presets
- audit trail on WIP field edits

---

## Open questions to confirm before implementation

1. **Class**
   - Is this an accounting/QBO class value?
   - Or an internal MDP project classification?
   - If it maps to a fixed list, can Venturity provide the allowed values?

2. **Estimated Cost**
   - Is Venturity happy with “current total budget from tracker” as the default estimate?
   - Or do they want a fully manual accounting estimate field every time?

3. **Completion Date**
   - Can existing `close_date` be treated as true completion date?
   - Or do we need a new explicit field?

4. **Contract Date**
   - Does this already live somewhere upstream (HubSpot/QBO) and just need syncing?
   - Or is this admin-entered only?

5. **Sales Tax Included**
   - Boolean is probably enough, but do they need tax amount too?

6. **Snapshots**
   - Do they need historical month-end WIP snapshots?
   - If yes, this should be part of v1 architecture, even if snapshot UX is phase 2.

---

## Recommended product call

### Greenlight now
- admin-only WIP report inside MDP Tracker
- schema additions for missing WIP metadata
- derived estimated cost with manual override
- filters for status/date/customer/PM/class
- CSV + Excel export

### Defer unless Venturity says it is mandatory immediately
- month-end snapshot/frozen reports
- bulk inline editing grid
- accounting formulas beyond the requested template columns

---

## Suggested implementation file targets (later build)

Likely files to touch:
- `src/components/Sidebar.tsx`
- `src/lib/types.ts`
- `src/app/admin/reports/wip/page.tsx` (new)
- `src/app/projects/[id]/edit/page.tsx`
- `supabase/migrations/<timestamp>_add_wip_reporting_fields.sql`
- export helper(s) under `src/lib/`
- contract tests under `tests/` or current repo test convention

---

## Proposed acceptance criteria

1. Admin can open a new WIP report screen in MDP Tracker.
2. Report displays the Venturity columns in a stable table.
3. Admin can filter by:
   - status
   - date range
   - PM
   - customer
   - class
4. Report can show active/completed/all projects.
5. Report can export current filtered data to CSV.
6. Report can export current filtered data to Excel.
7. Missing WIP metadata is visible and administratively fixable.
8. Estimated Cost is always populated either from derived budget or manual override.
9. Non-admin users cannot access the report or exports.

---

## Final recommendation

Build this as an **admin-only reporting subsystem backed by existing project data plus a handful of accounting-specific fields**.

Do not try to replicate Excel behavior first.
Do not treat this as only an export button.
Do not guess on month-end snapshot semantics.

The right MVP is:
- filterable WIP table
- clean field mapping
- export
- clear estimated-cost rule
- admin-only metadata maintenance

Then, if Venturity needs true accounting period history, add snapshots as the next layer.
