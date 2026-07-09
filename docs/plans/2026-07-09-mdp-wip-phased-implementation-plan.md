# MDP WIP Visible Summary — Phased Implementation Plan

> Builds on:
> - `docs/plans/2026-07-08-mdp-wip-visible-gap-analysis.md`
> - `docs/plans/2026-07-08-mdp-wip-qbo-billing-spec.md`

## Goal
Ship the Venturity-style visible WIP summary in controlled phases, using **QBO project actuals as the accounting truth** where we can already prove them, without blocking the first usable screen on unresolved retainage or date-scoped QBO report work.

## Locked business rules
1. Mirror the **visible** Venturity summary surface, not hidden workbook guts.
2. Hidden columns are out.
3. Anything below the horizontal stop line is out.
4. **Billings source of truth = QBO project truth.**
5. Cost actuals should also move to QBO project truth as we harden the reporting lane.
6. Retainage is unresolved and must be treated as a real source/integration question, not invented.

## Delivery strategy

### Phase 1A — ship the visible summary using current live QBO project totals
**Purpose:** Get the visible WIP table, exports, and snapshots into the right shape now.

**What ships**
- Replace the default metadata-first WIP table with the visible-summary order.
- Add shared workbook-mirroring formula helpers.
- Use existing tracker estimate fields for:
  - Updated Contract Amount
  - Updated Est Cost
  - Updated Est Gross Profit
  - Est GPM%
- Use existing `qbo_project_pnl` totals for current live accounting actuals:
  - Total Billed to Date = `qbo_income`
  - Total Cost to Date = `qbo_expenses`
- Compute:
  - Cost % Complete
  - Revenue Earned
  - Job Profit Earned
  - Job Profit % Earned
  - Billings in Excess of Costs
  - Costs in Excess of Billings
- Expand snapshot rows so these computed visible-summary fields are frozen.
- Update CSV/XLSX export to match the visible summary order.

**Explicit non-goals in 1A**
- no date-scoped live `As of Date` yet
- no current-year billings/costs yet
- no retainage claim yet
- no QBO cache table yet

**Implementation files**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/wip-report.ts`
- Create: `src/lib/wip-report-formulas.ts`
- Modify: `src/app/admin/reports/wip/page.tsx`
- Modify: `tests/wip-reporting-contract.test.mjs`
- Create: `src/lib/wip-report-formulas.test.ts`
- Create: `supabase/migrations/<new phase1a migration>.sql`

### Phase 1B — server-computed live report + date-scoped QBO metrics
**Purpose:** Move from “current snapshot totals” to a true date-aware live WIP computation lane.

**What ships**
- Server-side live WIP report route.
- QBO project WIP metrics resolver for a specific `asOfDate`.
- `As of Date` control in live mode.
- Optional cache table keyed by `(project_id, as_of_date)`.

**Target outputs**
- date-scoped Total Billed to Date
- date-scoped Total Cost to Date
- stable source metadata for operator debugging

### Phase 2 — current-year accounting fields
**Purpose:** Fill the remaining visible summary columns that depend on year-bucketed accounting truth.

**What ships**
- Current Year Total Billings
- Current Year Costs
- snapshot freeze of those year-bucketed values
- export parity for those columns

### Phase 3 — retainage completion
**Purpose:** Land retainage only after the source is proven.

**Possible outcomes**
- QBO can provide project-scoped retainage directly enough → implement it
- QBO cannot provide it cleanly → add an explicit nullable/manual accounting lane instead of fake computation

## Practical recommendation for today
Start with **Phase 1A** immediately. It gives Joe a materially better WIP surface and lets us freeze the right summary row shape, while keeping the unresolved parts honest.

## Open investigations
1. Can QBO reports/API provide retainage at the project level in a usable way?
2. What is the cleanest date-scoped QBO report path for billed/cost totals?
3. Is `projects.contract_amount` always the final updated contract amount in live practice?

## Exit criteria for the first build slice
- visible summary columns render in the WIP page
- formulas are centralized and tested
- current live QBO totals feed billed/cost actuals where available
- snapshots persist the new computed columns
- CSV/XLSX exports reflect the visible summary contract
- targeted tests pass
- app build passes
