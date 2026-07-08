# MDP WIP Visible-Columns Gap Analysis

> **For Hermes:** This is a planning/analysis document, not an implementation commit. It compares the current MDP Tracker WIP screen to the visible Venturity workbook surface shown in the `Example POC.xlsx` screenshot.

## Goal
Define the **visible-column** target for the MDP Tracker WIP tool based on the Venturity example workbook, using Joe's clarified rules:
- the workbook is a **format/template reference only**, not Mecca data
- **hidden columns are not required**
- the red horizontal **STOP HERE** row means **nothing below it is required**
- the red vertical `BU` / `STOP HERE` marker remains the right-side cutoff, but the screenshot clarification is more important for real scope

---

## Source-of-truth interpretation

### Workbook / screenshot rules locked
1. Use the sheet `WIP Jun'25` as the reference surface.
2. Treat the screenshot view as the authoritative operator-facing target.
3. Ignore hidden/collapsed columns.
4. Ignore everything below the red horizontal `STOP HERE` line.
5. Ignore columns to the right of the red vertical `STOP HERE` lane.

### Important consequence
The requested mirror is **not** the raw full `A:BU` sheet structure.
It is the **visible summary/reporting surface** shown to the operator.

That means many intermediate helper columns and monthly detail buckets in the workbook should **not** be copied into the default MDP Tracker WIP screen just because they exist in Excel.

---

## Current MDP Tracker WIP screen

Current table columns in `src/app/admin/reports/wip/page.tsx`:
1. Customer
2. Project #
3. Project Name
4. Class
5. Contract Date
6. Contract Amount
7. Estimated Cost
8. Sales Tax Included
9. Completion Date
10. Status
11. PM
12. Estimate Source

Current live row shape in `src/lib/wip-report.ts`:
- `customer`
- `project_number`
- `project_name`
- `wip_class`
- `contract_date`
- `contract_amount`
- `estimated_cost`
- `estimated_cost_source`
- `sales_tax_included`
- `completion_date`
- `project_status`
- `pm_initials`
- `source_updated_at`

Current reporting strengths:
- live view + snapshot mode already exist
- CSV/XLSX export already exist
- estimated cost drill-in already exists
- filter model already exists
- WIP-specific metadata fields already exist (`wip_class`, `sales_tax_included`, `estimated_cost_override`)

Current reporting limitation:
- the table is still a **metadata-first accounting stub**, not a true WIP math/reporting surface

---

## Venturity visible target surface (from screenshot)

Visible summary columns/sections in the screenshot appear to be:
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
17. Current Year Costs / Total Costs

Visible but likely structural/grouping, not standalone product fields:
- grouped `Contract Data`
- grouped `Accounting Software - QBO`
- grouped `Liability / Asset`
- grouped `Over Billed / Under Billed`

Explicitly out of scope from Joe's screenshot rule:
- hidden monthly helper/detail columns
- everything below the red horizontal `STOP HERE`
- right-side columns after the vertical stop lane, including:
  - Remaining to be billed
  - A/R Balance
  - Avg Days Payable
  - Applies Sales tax

---

## Gap analysis: current MDP WIP vs visible Venturity target

| Target visible column | Present in current WIP screen? | Likely current source | Gap status | Notes |
|---|---:|---|---|---|
| Customer | Yes | `project_summary.client` | Small | Already present |
| Project | Partial | `job_number` + `name` | Small | Current app splits into `Project #` and `Project Name`; screenshot combines them visually |
| Updated Contract Amount | Partial | `project_summary.contract_amount` | Small/semantic | Need to confirm current `contract_amount` is the final updated contract amount, not original-only |
| Updated Est Cost | Partial | `COALESCE(estimated_cost_override, total_budget)` | Small/semantic | Current field is called `Estimated Cost`; target label should likely become `Updated Est Cost` |
| Updated Est Gross Profit | No | derived from contract - est cost | Medium | Easy derived field once updated contract + updated est cost semantics are locked |
| Est GPM% | No | `(updated gross profit / updated contract amount)` | Medium | Easy derived field |
| Total Billed to Date | No | no current in-app WIP source found | Large | Missing source/system integration |
| Total Cost to Date | No (but partially available) | `total_spent + qbo_labor_cost` | Medium | Available enough for first pass, but should be made explicit in WIP row/view |
| Cost % Complete | No | `total_cost_to_date / updated_est_cost` | Medium | Derivable once total cost field is added |
| Revenue Earned | No | `min(cost_pct_complete * updated_contract_amount, updated_contract_amount)` | Medium | Derivable once total cost / pct complete are in place |
| Job Profit Earned | No | `revenue_earned - total_cost_to_date` | Medium | Derivable |
| Job Profit % Earned | No | `job_profit_earned / revenue_earned` | Medium | Derivable |
| Billings in Excess of Costs | No | `max(total_billed_to_date - revenue_earned, 0)` | Large | Depends on billed-to-date source |
| Costs in Excess of Billings | No | `max(revenue_earned - total_billed_to_date, 0)` | Large | Depends on billed-to-date source |
| Current Year Total Billings | No | no current year billing snapshot/model found | Large | Missing source/system integration |
| Current Year Total Retainage | No | no retainage source found | Large | Missing source and data model |
| Current Year Costs / Total Costs | Partial | current-year cost not modeled; total cost partially available | Large | Need year-bucketing plus current-year logic |

---

## Existing internal columns that are useful but not part of the visible Venturity target

These exist in the current MDP WIP screen but do **not** appear to be part of the visible target table in the screenshot:
- Class
- Contract Date
- Sales Tax Included
- Completion Date
- Status
- PM
- Estimate Source

Recommendation:
- keep these as **filters, drill-in metadata, or optional columns**
- do **not** force them into the default visible table if the goal is to mirror the Venturity screenshot more closely

---

## Formula/data readiness by target area

### 1. Already strong enough for a first implementation pass
These can be built mostly from existing tracker data:
- Customer
- Project
- Updated Contract Amount (assuming `contract_amount` is the updated/final amount)
- Updated Est Cost
- Updated Est Gross Profit
- Est GPM%
- Total Cost to Date
- Cost % Complete
- Revenue Earned
- Job Profit Earned
- Job Profit % Earned

### 2. Missing source-of-truth data today
These do **not** appear to have a ready current source in MDP Tracker:
- Total Billed to Date
- Current Year Total Billings
- Current Year Total Retainage
- any real retainage sub-ledger/history

### 3. Blocked by missing billing source
These require billed-to-date before they can be trusted:
- Billings in Excess of Costs
- Costs in Excess of Billings

### 4. Current-year slicing not modeled yet
These need month/year bucket logic even if total values exist:
- Current Year Total Billings
- Current Year Total Retainage
- Current Year Costs

---

## What the repo already gives us

### Already available in `project_summary`
- `contract_amount`
- `total_budget`
- `estimated_cost_override`
- `total_spent`
- `qbo_labor_cost`
- `pct_budget_used`
- `qbo_project_id`
- `qbo_project_url`

### Important current cost behavior
Elsewhere in the app, total cost is already treated as:
- `total_spent + qbo_labor_cost`

Examples:
- `src/app/page.tsx`
- `src/app/projects/page.tsx`
- `src/app/admin/reconciliation/page.tsx`

That means a WIP `Total Cost to Date` column has a credible first-pass source already, even though the WIP screen does not currently expose it.

### Important current limitation
The WIP foundation migration and helper layer do **not** currently store or expose:
- billed-to-date amounts
- current-year billings
- retainage balances
- current-year retainage
- current-year costs by accounting period

---

## Recommended interpretation of the screenshot for product scope

### Best product reading
The screenshot suggests Venturity wants a **summary WIP report** that looks like their visible Excel surface, not a literal 1:1 spreadsheet clone with all hidden helper columns restored.

### Practical implication
The best near-term app scope is probably:
1. **mirror the visible summary columns on-screen**
2. keep existing WIP metadata as filters/drill-ins
3. avoid rebuilding hidden monthly buckets until Venturity explicitly asks for them
4. add snapshot/export support for the visible summary shape first

---

## Recommended phased implementation approach

### Phase 1 — visible-summary WIP math layer
Add these computed/report columns to the WIP row model and UI first:
- updated_contract_amount
- updated_est_cost
- updated_est_gross_profit
- est_gpm_pct
- total_cost_to_date
- cost_pct_complete
- revenue_earned
- job_profit_earned
- job_profit_pct_earned

This phase does **not** require billing or retainage history.

### Phase 2 — billed-to-date + over/under billing
Add a trustworthy source for:
- total_billed_to_date
- current_year_total_billings

Then unlock:
- billings_in_excess_of_costs
- costs_in_excess_of_billings

### Phase 3 — retainage + year-bucket reporting
Only after the billing/accounting source is clear:
- current_year_total_retainage
- current_year_costs
- optional periodized snapshot/export detail

---

## Most important open questions before implementation

1. **Is `projects.contract_amount` already the updated/final contract amount?**
   - If yes, just relabel in WIP.
   - If no, we need separate original/change-order/final contract fields.

2. **What is the source of truth for billings?**
   - QBO invoice/customer history?
   - another imported ledger?
   - manual accounting entry?

3. **What is the source of truth for retainage?**
   - QBO?
   - manual field?
   - spreadsheet-only today?

4. **Should the default WIP table become the visible Venturity summary, with current metadata moved to filters/drill-ins?**
   - Recommended answer: **yes**.

---

## Recommendation

### Do next
Write the implementation spec around the **visible summary surface**, not raw workbook columns.

### Do not do next
Do **not** try to reproduce every hidden monthly bucket from the spreadsheet as the default app UI.

### Best immediate build target
A first serious implementation should replace the current metadata-first WIP table with a summary-math table closer to the screenshot, using existing tracker cost/budget logic first and deferring billings/retainage until their source is locked.
