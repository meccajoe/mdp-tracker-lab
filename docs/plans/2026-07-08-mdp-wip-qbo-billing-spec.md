# MDP WIP QBO Billing Spec

> **For Hermes:** This is a planning/spec document, not an implementation start. It turns Joe's workbook + screenshot guidance into an implementation-ready product spec.

**Goal:** Rework the MDP Tracker WIP report so the default screen mirrors the **visible Venturity summary view** (not the hidden spreadsheet guts), while using **QBO project data as the source of truth for billings**.

**Architecture:** Keep the WIP feature inside MDP Tracker, but move live WIP row assembly from a thin client-side `project_summary -> buildLiveWipRow()` mapping into a server-computed reporting layer. Persist frozen snapshot rows with the computed accounting fields so historical month-end exports do not drift. Use tracker-side budget/estimate fields for contract/estimate math, and QBO project data for billing actuals.

**Tech Stack:** Next.js app router, Supabase/Postgres, existing `project_summary`, existing QBO auth helper, existing QBO project profitability sync lane, existing WIP snapshots/export UI.

---

## Operator truth

### Who this is for
- **Venturity / accounting** wants a WIP report that looks like the visible workbook surface they actually use.
- **MDP admins** need a trustworthy in-app reporting surface and frozen snapshots for period-end review/export.
- **Joe** wants the workbook mirrored as a product surface without copying spreadsheet clutter that operators do not actually look at.

### What Joe clarified
1. The workbook is **only a format/model reference**, not Mecca source data.
2. **Hidden columns are not required.**
3. The horizontal red **STOP HERE** line means **nothing below it is required**.
4. **Billings source of truth should be the QBO project.**

### Product consequence
The target is **not** the raw `A:BU` workbook internals. The target is the **visible summary WIP surface** plus a stable export/snapshot contract.

---

## Scope locked from the workbook + screenshot

### Mirror this visible summary surface
Default WIP columns should become:
1. Customer
2. Project
3. Updated Contract Amount
4. Updated Est Cost
5. Updated Est Gross Profit
6. Est GPM%
7. Total Billed to Date
8. Total Cost to Date
9. Cost % Complete
10. Revenue Earned
11. Job Profit Earned
12. Job Profit % Earned
13. Billings in Excess of Costs
14. Costs in Excess of Billings
15. Current Year Total Billings
16. Current Year Total Retainage
17. Current Year Costs

### Keep these out of the default visible table
These remain useful, but should move to filters / drill-ins / optional columns rather than the default grid:
- Class
- Contract Date
- Sales Tax Included
- Completion Date
- Status
- PM
- Estimate Source

### Explicitly out of scope for v1 mirror
- hidden monthly helper columns from the workbook
- everything below the horizontal red stop line
- columns to the right of the vertical stop lane, including:
  - Remaining to be billed
  - A/R Balance
  - Avg Days Payable
  - Applies Sales tax

---

## Source-of-truth rules

### Tracker-owned estimate / setup fields
These stay sourced from MDP Tracker:
- `Customer` → `project_summary.client`
- `Project` → composite display of `job_number` + `name`
- `Updated Contract Amount` → `project_summary.contract_amount`
- `Updated Est Cost` → `COALESCE(estimated_cost_override, total_budget)`

### QBO project-owned accounting actuals
These should come from QBO project data, not spreadsheet/manual formulas in the app:
- `Total Billed to Date`
- `Current Year Total Billings`
- `Current Year Total Retainage` (when QBO can supply it)

### Recommended accounting source rule for costs
Although Joe only explicitly locked **billings** to QBO project truth, the cleanest accounting model is:
- `Total Cost to Date` → QBO project cost total as of date
- `Current Year Costs` → QBO project costs within the current report year through the as-of date

Why this is recommended:
- it keeps `billed`, `cost`, and `over/under billing` math on the same accounting source
- it avoids a mixed-source report where billings come from QBO but costs come from tracker operational data

### Fallback if QBO current-cost lane is too slow to ship first
If the QBO date-scoped cost lane blocks v1, use this temporary fallback only for Phase 1:
- `Total Cost to Date` = `project_summary.total_spent + project_summary.qbo_labor_cost`
- `Current Year Costs` = sum of tracker `expenses.amount` by `expenses.date` within year + sum of `qbo_labor_entries` by `date` within year

But treat that as a **temporary compatibility lane**, not the final accounting truth.

---

## Formula contract (mirror the workbook behavior)

These formulas should be codified in one shared helper, not re-implemented inline in the page.

### 1. Updated Contract Amount
```text
updated_contract_amount = contract_amount
```

### 2. Updated Est Cost
```text
updated_est_cost = COALESCE(estimated_cost_override, total_budget)
```

### 3. Updated Est Gross Profit
```text
updated_est_gross_profit = updated_contract_amount - updated_est_cost
```

### 4. Est GPM%
```text
est_gpm_pct = updated_est_gross_profit / updated_contract_amount
```
Return `0` when contract amount is null/zero.

### 5. Total Billed to Date
```text
total_billed_to_date = QBO project billed total through as_of_date
```

### 6. Total Cost to Date
```text
total_cost_to_date = accounting cost total through as_of_date
```
Prefer QBO project costs; use tracker fallback only if needed for first ship.

### 7. Cost % Complete
Mirror workbook behavior exactly — do **not** cap at 100% here:
```text
cost_pct_complete = total_cost_to_date / updated_est_cost
```
Return `0` when estimated cost is null/zero.

### 8. Revenue Earned
Mirror workbook cap logic:
```text
if cost_pct_complete > 1:
  revenue_earned = updated_contract_amount
else:
  revenue_earned = cost_pct_complete * updated_contract_amount
```

### 9. Job Profit Earned
```text
job_profit_earned = revenue_earned - total_cost_to_date
```

### 10. Job Profit % Earned
Mirror workbook behavior exactly:
```text
if job_profit_earned > 0 and revenue_earned > 0:
  job_profit_pct_earned = job_profit_earned / revenue_earned
else:
  job_profit_pct_earned = 0
```

### 11. Billings in Excess of Costs
```text
billings_in_excess_of_costs = max(total_billed_to_date - revenue_earned, 0)
```

### 12. Costs in Excess of Billings
```text
costs_in_excess_of_billings = max(revenue_earned - total_billed_to_date, 0)
```

### 13. Current Year Total Billings
```text
current_year_total_billings = QBO project billed total from Jan 1 of report year through as_of_date
```

### 14. Current Year Total Retainage
```text
current_year_total_retainage = QBO project retainage total from Jan 1 of report year through as_of_date
```
If unavailable from QBO in the first implementation, return `null` / `—` rather than fabricating a value.

### 15. Current Year Costs
```text
current_year_costs = accounting costs from Jan 1 of report year through as_of_date
```

---

## Live vs snapshot behavior

### Live mode
Add an explicit **As of Date** control to live WIP mode.
- default = today
- user can change it to any prior date
- all QBO-backed and year-bucketed fields resolve against that as-of date

### Snapshot mode
Snapshot creation should persist the **fully computed visible summary row**, not only the old metadata fields.
That means snapshot rows must freeze:
- contract/estimate fields
- billed/cost actuals
- cost % complete
- revenue/profit earned
- over/under billing
- current-year billings / retainage / costs

Do **not** reconstruct old snapshots from mutable live tables later.

---

## Recommended implementation architecture

## 1) Move live WIP row assembly to a server-side report builder
Current state:
- `src/app/admin/reports/wip/page.tsx` loads `project_summary` directly in the client
- `src/lib/wip-report.ts` builds a thin row from client-available fields

Recommended change:
- create a server-side live report route that returns **fully computed WIP rows** for a given as-of date
- client page consumes the ready-made rows instead of deriving them locally from `project_summary`

Recommended route:
- `src/app/api/reports/wip/live/route.ts`

Recommended query params / POST body:
- `asOfDate`
- optional current filters only if server-side filtering becomes useful later

## 2) Add a dedicated QBO WIP financials adapter
Create a shared adapter/helper for project-scoped WIP actuals.

Recommended file:
- `src/lib/qbo-project-wip.ts`

Responsibilities:
- fetch project-scoped billed totals through `asOfDate`
- fetch project-scoped current-year billed totals
- fetch or attempt to fetch project-scoped current-year retainage
- fetch or attempt to fetch project-scoped total/current-year cost totals if we commit to QBO cost truth
- normalize all values into one internal metrics shape

## 3) Add a persistent cache table for resolved as-of-date project financials
Because the WIP screen and snapshot creation will otherwise hammer QBO repeatedly, add a small cache table keyed by project + as-of date.

Recommended table:
- `qbo_project_wip_metrics`

Recommended columns:
- `project_id text not null`
- `as_of_date date not null`
- `total_billed_to_date numeric(12,2)`
- `current_year_total_billings numeric(12,2)`
- `current_year_total_retainage numeric(12,2)` nullable
- `total_cost_to_date numeric(12,2)` nullable if sourced from QBO
- `current_year_costs numeric(12,2)` nullable if sourced from QBO
- `billing_source text not null` (e.g. `qbo_project_report`, `qbo_invoice_sum`)
- `cost_source text` nullable
- `retainage_source text` nullable
- `synced_at timestamptz not null default now()`
- primary key `(project_id, as_of_date)`

Why this is worth it:
- live view for a prior as-of date can be re-opened without refetching everything
- snapshot creation can batch against a stable local cache first
- troubleshooting becomes easier because we can inspect exactly which totals were resolved for a given date

## 4) Expand snapshot rows to match the visible summary contract
Current `wip_report_snapshot_rows` is too narrow.

Add fields for:
- `updated_contract_amount`
- `updated_est_cost`
- `updated_est_gross_profit`
- `est_gpm_pct`
- `total_billed_to_date`
- `total_cost_to_date`
- `cost_pct_complete`
- `revenue_earned`
- `job_profit_earned`
- `job_profit_pct_earned`
- `billings_in_excess_of_costs`
- `costs_in_excess_of_billings`
- `current_year_total_billings`
- `current_year_total_retainage`
- `current_year_costs`
- `as_of_date`

Keep the existing metadata columns too:
- customer
- project number / name
- wip class
- sales tax included
- completion date
- status
- PM

---

## UI/UX spec

## Default table columns
Replace the current metadata-first table with this default order:
1. Customer
2. Project
3. Updated Contract Amount
4. Updated Est Cost
5. Updated Est Gross Profit
6. Est GPM%
7. Total Billed to Date
8. Total Cost to Date
9. Cost % Complete
10. Revenue Earned
11. Job Profit Earned
12. Job Profit % Earned
13. Billings in Excess of Costs
14. Costs in Excess of Billings
15. Current Year Total Billings
16. Current Year Total Retainage
17. Current Year Costs

## Keep existing filters
Keep and retain these filters even though they are not default columns:
- Status
- PM
- Customer
- Class
- Contract Date range
- Completion Date range
- Sales Tax Included
- Search

## Add live As-of Date control
Add to the top filter/control area:
- `As of Date`

This is not cosmetic; it drives the QBO/annual metric calculations.

## Drill-ins
Keep:
- project row drill-in dialog
- estimated cost breakdown drill-in dialog

Recommended new drill-in later:
- billed/cost actuals source dialog showing which QBO source + sync timestamp backed the row

---

## QBO billing-source strategy

Joe has now locked the business rule:
- **billings source of truth = QBO project**

The spec should therefore prefer this source order:

### Preferred billing source order
1. project-scoped QBO report or transaction lane that directly respects the true QBO project
2. fallback: sum of QBO invoices/transactions explicitly tied to the true QBO project id / `ProjectRef`
3. no spreadsheet/manual fallback in the core app for billed totals

### Practical implementation rule
If the exact report endpoint behind the QBO project details page still needs validation, implement the adapter layer so the app contract does **not** care whether the upstream data came from:
- project report endpoint
- invoice list/query endpoint
- transaction list endpoint

The app should only care that it receives:
- total billed to date
- current-year total billings
- retainage if available
- source metadata

---

## Cost-source recommendation

### Recommended final model
For accounting-facing WIP, use QBO project actuals for the accounting actual block whenever practical:
- total billed to date
- total cost to date
- current year total billings
- current year costs
- current year retainage

### Why
Using tracker operational costs against QBO billings can make the WIP table mathematically clean but operationally non-reconciling.

### If we need a staged rollout
- **Phase 1A:** tracker-based costs + QBO billings
- **Phase 1B:** migrate total/current-year costs to QBO-backed values once the date-scoped project cost lane is validated

---

## File-level implementation plan

### New / expanded types and helpers
Modify:
- `src/lib/types.ts`
- `src/lib/wip-report.ts`

Create:
- `src/lib/wip-report-formulas.ts`
- `src/lib/qbo-project-wip.ts`

Responsibilities:
- define the richer WIP row shape
- isolate workbook-mirroring formulas in one place
- isolate QBO metrics fetching / normalization in one place

### Live report API
Create:
- `src/app/api/reports/wip/live/route.ts`

Responsibilities:
- accept `asOfDate`
- load `project_summary`
- join cached/resolved QBO project metrics
- compute WIP summary rows via shared formulas helper
- return rows for the client page

### QBO metrics sync / fetch API
Create:
- `src/app/api/qbo/project-wip/route.ts`

Responsibilities:
- batch-resolve WIP metrics for one or many projects at a given as-of date
- upsert into `qbo_project_wip_metrics`
- expose sync result metadata for operators/debugging

### WIP page
Modify:
- `src/app/admin/reports/wip/page.tsx`

Responsibilities:
- stop building live rows client-side from raw `project_summary`
- add `As of Date`
- fetch server-built live rows
- rework visible columns to the summary-math target
- keep filters, snapshot UX, CSV/XLSX export

### Snapshot schema
Modify:
- `supabase/migrations/<new migration>.sql`

Responsibilities:
- create `qbo_project_wip_metrics`
- expand `wip_report_snapshot_rows`
- optionally add indexes for `(project_id, as_of_date)` and snapshot query patterns

---

## Export contract

### CSV/XLSX default export should mirror the visible summary table
Export columns should match the default visible summary order exactly.

### Metadata fields not in the visible summary
These can be excluded from default export or added only in an optional "internal detail export" later:
- Class
- Sales Tax Included
- Contract Date
- Completion Date
- Status
- PM
- Estimate Source

Recommendation:
- keep default export aligned to Venturity visible summary
- add a later optional internal export if Mecca admins need the extra metadata

---

## Testing / verification spec

### Source-level contract tests
Expand/add contract coverage for:
- new visible WIP columns on the page
- As-of Date control
- server-side live-report route presence
- snapshot row schema expansion
- QBO metrics table migration
- export helpers using the new column order

Likely files:
- `tests/wip-reporting-contract.test.mjs`
- new focused tests for QBO WIP adapter and formula helper

### Runtime logic tests
Add direct unit tests for workbook-mirroring formulas:
- gross profit math
- uncapped `cost_pct_complete`
- capped `revenue_earned`
- over/under billing math
- current-year field handling
- zero/null guards

Likely files:
- `src/lib/wip-report-formulas.test.ts`
- `src/lib/qbo-project-wip.test.ts`

### Verification sequence
1. targeted WIP contract tests
2. formula helper tests
3. QBO adapter tests
4. build
5. live admin-page verification
6. one real project spot-check against QBO project values
7. snapshot creation + re-open snapshot to confirm frozen totals persist

---

## Phased delivery recommendation

### Phase 1 — summary-math WIP table + live as-of date
Ship:
- new default visible summary columns
- tracker-based estimate math
- QBO project billed totals
- over/under billing
- snapshot row expansion

Allowed temporary compromise if needed:
- use tracker cost totals before QBO date-scoped cost truth is fully landed

### Phase 2 — QBO-backed current-year and total actuals hardening
Ship:
- QBO-backed total cost to date
- QBO-backed current-year costs
- current-year total billings
- over/under billing with fully accounting-sourced actuals

### Phase 3 — retainage completion
Ship:
- current-year total retainage once QBO source is validated
- optional retainage drill-in/source notes

---

## Open questions (not blockers for writing code structure, but blockers for full accounting parity)

1. **Retainage source in QBO:**
   - Can QBO expose project-scoped retainage directly enough for this report?
   - If not, do we want nullable/blank first or a manual accounting override lane?

2. **Cost truth finalization:**
   - Should we commit immediately to QBO-backed total/current-year costs for the accounting block, or allow a staged tracker-cost fallback?
   - Recommendation: stage if needed, but final target should be QBO-backed actuals for consistency.

3. **Contract amount semantics:**
   - Confirm `projects.contract_amount` is already the final updated contract amount and not only the original deal value.

---

## Recommendation

Build this as a **server-computed visible summary WIP report** with:
- tracker-owned estimate fields
- QBO project-owned billing actuals
- snapshot rows that freeze the computed summary

Do **not** continue evolving the current client-only metadata table and hope it grows into an accounting report. The right next move is a dedicated WIP reporting computation layer.
