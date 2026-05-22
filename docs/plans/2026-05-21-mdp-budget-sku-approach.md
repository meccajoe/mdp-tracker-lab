# MDP Tracker Budget SKU Approach Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Move MDP Tracker’s labor/materials budget derivation from total contract amount to fabrication-SKU subtotal, raise the labor rate baseline to $41/hr, and break crating out into its own budget category.

**Architecture:** Keep the existing quote-parser → stored project budget fields → project detail actuals flow, but make L&M first-class SKU-derived buckets just like the non-L&M categories. Add explicit quote/budget/pct handling for fabrication and crating so budget logic is internally consistent and actuals mapping no longer disagrees with quote parsing.

**Tech Stack:** Next.js app router, TypeScript, Supabase, HubSpot quote line-item parsing, existing project_summary/projects schema, Bill.com/QBO-backed actuals.

---

## Current baseline confirmed

- `400100` is currently the explicit fabrication SKU and lives in `CONTRACT_AMOUNT_SKUS` in `src/lib/hubspot-quote-parser.ts`.
- L&M budgets are currently derived from `contractAmount`:
  - labor budget hours = `(contractAmount * labor%) / laborRate`
  - materials budget = `contractAmount * materials%`
- Current labor-rate constants are still `$30/hr` in multiple places.
- `400404` (custom crating) currently maps to `shipping` in the quote parser.
- On the project page, `Custom Crating` currently appears under `budget_materials`, while `Storage` rolls into `budget_shipping` and `Graphics` rolls into `budget_flooring`.
- Desired new behavior:
  - total **fabrication SKUs only** for L&M base
  - labor budget dollars = `fabricationSubtotal * pct_labor`
  - materials budget dollars = `fabricationSubtotal * pct_materials`
  - budget hours = `laborBudgetDollars / 41`
  - graphics/crating/storage are **not** part of L&M
  - crating becomes its **own budget category**

---

## Design decisions to implement

### New/updated quote buckets

Keep these as the quote-derived budget buckets:
- `fabrication` (new explicit quote bucket used only to derive L&M budgets)
- `design`
- `pm`
- `shipping`
- `id_labor`
- `travel`
- `props`
- `equipment`
- `rental`
- `flooring`
- `crating` (new)

### New/updated budget rules

- `quote_fabrication` is not necessarily persisted if we want to keep it transient, but the parser must calculate a fabrication subtotal.
- `budget_hrs` should be derived from `fabricationSubtotal`, not `contractAmount`.
- `budget_materials` should be derived from `fabricationSubtotal`, not `contractAmount`.
- `budget_crating` becomes a new explicit non-L&M category.
- `400404` should stop mapping to shipping and start mapping to crating.
- `400500/400501/400502` remain storage and stay out of L&M.
- `400800` remains graphics/flooring and stays out of L&M.
- labor-rate baseline changes from `30` to `41` everywhere relevant.

### Actuals-side design

Budget breakdown row mapping should become:
- `budget_hrs` → labor actuals only
- `budget_materials` → fabrication/materials actuals only (`Fabrication`, `Fab Supplies and Small Equipment`)
- `budget_crating` → `Custom Crating`
- `budget_shipping` → shipping/freight/storage only (`Shipping`, truck variants, `Shipping/Trucking`, `Fuel Costs`, `Storage`)

This avoids today’s split-brain behavior where crating parses as shipping but displays under materials.

---

## Task 1: Add schema support for crating and update project types

**Objective:** Extend the schema/types so crating is a first-class quote/budget/percent category.

**Files:**
- Modify: `supabase/migrations/` (new migration)
- Modify: `src/lib/types.ts`
- Modify: `src/lib/constants.ts`

**Step 1: Create a migration for crating fields and global pct default**

Create a new migration file under `supabase/migrations/`, e.g.:
- `20260521_add_crating_budget_category.sql`

Include:

```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_crating numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_crating numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_crating numeric(5,2);

INSERT INTO budget_formula_settings (category, label, default_pct)
VALUES ('crating', 'Crating', 60)
ON CONFLICT (category) DO NOTHING;
```

**Step 2: Run/verify migration syntax**

If there is a local migration check command, run it. Otherwise verify SQL carefully by inspection.

**Step 3: Update `Project` type**

In `src/lib/types.ts`, add:

```ts
budget_crating: number | null;
quote_crating: number | null;
pct_crating: number | null;
```

Keep them grouped with the other quote/budget/pct fields.

**Step 4: Update visible budget field list**

In `src/lib/constants.ts`, add a new row:

```ts
{ key: "budget_crating", label: "Crating", isHours: false }
```

Place it near shipping/materials.

**Step 5: Commit**

```bash
git add supabase/migrations src/lib/types.ts src/lib/constants.ts
git commit -m "feat: add crating budget category"
```

---

## Task 2: Change budget formula constants and category definitions

**Objective:** Centralize the new labor rate and add crating to formula metadata.

**Files:**
- Modify: `src/lib/budget-formula.ts`

**Step 1: Update labor rate constant**

Change:

```ts
export const LABOR_RATE_PER_HR = 30;
```

to:

```ts
export const LABOR_RATE_PER_HR = 41;
```

**Step 2: Add crating to hardcoded default percentages**

Update the defaults object with an explicit value agreed by the business. If not yet finalized, use the same placeholder/default chosen in the migration and mark it with a comment.

Example:

```ts
crating: 60,
```

**Step 3: Add crating to `BUDGET_CATEGORIES`**

Add:

```ts
{ key: "crating", label: "Crating", quoteKey: "quote_crating", budgetKey: "budget_crating", pctKey: "pct_crating" },
```

**Step 4: Verify no compile errors in this file**

Run:

```bash
npm run build
```

Expected: build should still pass or surface the next file that needs updating for the new key.

**Step 5: Commit**

```bash
git add src/lib/budget-formula.ts
git commit -m "feat: update budget formula constants for fabrication-based lm"
```

---

## Task 3: Refactor quote parsing to produce fabrication and crating subtotals

**Objective:** Stop treating fabrication as anonymous contract-only revenue and produce explicit fabrication/crating quote subtotals.

**Files:**
- Modify: `src/lib/hubspot-quote-parser.ts`
- Test: add or extend parser tests if the repo already has a test harness; otherwise plan to add them in a dedicated follow-up file.

**Step 1: Write failing parser tests (if test harness exists)**

Add tests covering:
- `400100` contributes to `fabrication`
- `400404` contributes to `crating`
- `400800` does not contribute to fabrication-based L&M
- `400500/400501/400502` do not contribute to fabrication-based L&M

If there is no existing parser test file, create one under the project’s test conventions.

**Step 2: Extend `ParsedQuote.quotes` shape**

Add:

```ts
fabrication: number;
crating: number;
rental: number;
```

Note: if rental is already represented elsewhere in UI/schema but missing from `ParsedQuote`, align the parser shape now so the types match the real category list.

**Step 3: Move SKU logic out of contract-only for fabrication**

Update SKU handling so:
- `400100` → `fabrication`
- `400404` → `crating`
- `400800` stays non-fabrication (likely flooring/graphics path, depending on current business rule)
- `400500/400501/400502` remain outside fabrication subtotal

Expected shape:

```ts
const SKU_MAP: Record<string, string> = {
  "400100": "fabrication",
  "400404": "crating",
  ...
};
```

Then reduce `CONTRACT_AMOUNT_SKUS` so it no longer contains fabrication and crating if they are explicitly classified.

**Step 4: Keep `contractAmount` total behavior intact**

Do **not** stop summing all quote lines into `contractAmount`. We still need total contract value for the broader project, just not for L&M budget derivation.

**Step 5: Verify parser output manually**

Use a quick script or test case to confirm the parser returns:
- `quotes.fabrication > 0` when fabrication lines exist
- `quotes.crating > 0` when crating lines exist
- graphics/storage do not inflate fabrication subtotal

**Step 6: Commit**

```bash
git add src/lib/hubspot-quote-parser.ts [tests if any]
git commit -m "feat: classify fabrication and crating quote skus"
```

---

## Task 4: Change L&M budget calculation to use fabrication subtotal

**Objective:** Derive labor/materials budgets from fabrication subtotal instead of contract amount.

**Files:**
- Modify: `src/lib/hubspot-quote-parser.ts`

**Step 1: Write a failing regression test**

Test scenario:
- contract amount includes fabrication + graphics + storage + shipping
- only fabrication should feed L&M
- labor/materials outputs should be based only on fabrication subtotal

Example expected behavior:
- contract total = 100,000
- fabrication subtotal = 40,000
- labor pct = 25
- materials pct = 25
- labor budget dollars = 10,000
- labor hours = `10000 / 41`
- materials budget = 10,000

**Step 2: Implement formula change**

In `calculateBudgets(parsed)`:

Replace:

```ts
budget_hrs: contractAmount > 0 ? Math.round((contractAmount * p("labor") / 100) / LABOR_RATE_PER_HR) : null,
budget_materials: contractAmount > 0 ? Math.round(contractAmount * p("materials") / 100) : null,
```

with:

```ts
const fabricationSubtotal = q.fabrication;
const laborBudgetDollars = fabricationSubtotal > 0 ? (fabricationSubtotal * p("labor") / 100) : 0;

budget_hrs: fabricationSubtotal > 0 ? Math.round(laborBudgetDollars / LABOR_RATE_PER_HR) : null,
budget_materials: fabricationSubtotal > 0 ? Math.round(fabricationSubtotal * p("materials") / 100) : null,
```

**Step 3: Preserve low-fab behavior**

If fabrication subtotal is 0 or null:
- labor/material budgets should be null (or 0 if that is the established UI convention — prefer current null behavior if possible).

**Step 4: Re-run the targeted test**

Run the parser-specific test.
Expected: pass.

**Step 5: Commit**

```bash
git add src/lib/hubspot-quote-parser.ts [tests]
git commit -m "fix: derive lm budgets from fabrication subtotal"
```

---

## Task 5: Persist crating on project creation and preserve L&M semantics in webhook flow

**Objective:** Ensure project creation from HubSpot stores the new quote/budget fields correctly.

**Files:**
- Modify: `src/app/api/webhooks/hubspot/route.ts`

**Step 1: Add crating to budget snapshot/reporting output**

Update the categories array used for Slack/project snapshot generation:

```ts
{ label: "Crating", quoteVal: q.crating, budgetVal: budgets.budget_crating, pct: pcts.crating },
```

**Step 2: Persist new quote/budget/pct fields**

Add to insert payload:

```ts
quote_crating: parsed.quotes.crating || null,
budget_crating: budgets.budget_crating,
pct_crating: null,
```

**Step 3: Keep L&M fields as formula-derived values**

Do not repurpose `quote_labor` or `quote_materials` unless you explicitly decide to start storing fabrication-derived source values there. If you do want that, document it and update types/UI consistently.

**Step 4: Verify payload shape**

Run a typecheck/build.

**Step 5: Commit**

```bash
git add src/app/api/webhooks/hubspot/route.ts
git commit -m "feat: persist crating quote and budget values"
```

---

## Task 6: Fix project detail actuals mapping so materials/crating/shipping match the new model

**Objective:** Make the project detail page’s budget rows match the new budget architecture.

**Files:**
- Modify: `src/app/projects/[id]/page.tsx`

**Step 1: Update `BUDGET_TO_CATEGORY_MAP`**

Change it to reflect the new rules:

- `budget_materials` should include only fabrication/material-ish actuals, e.g.:
  - `Fabrication`
  - `Fab Supplies and Small Equipment`
- remove `Custom Crating` from `budget_materials`
- add `budget_crating: ["Custom Crating"]`
- keep `Storage` in `budget_shipping`
- keep `Graphics` in `budget_flooring`

**Step 2: Review comments for accuracy**

Update the explanatory comments so future edits don’t reintroduce the old assumption.

**Step 3: Confirm no accidental overlaps**

Make sure `Custom Crating` appears in exactly one bucket.
Make sure `Storage` appears in exactly one bucket.
Make sure `Fabrication` remains in materials actuals but not in shipping/crating/flooring.

**Step 4: Verify budget table rendering**

Run the app locally and inspect a project page with:
- fabrication actuals
- crating actuals
- storage actuals

Expected:
- each spend line lands in only one budget row
- materials no longer silently includes crating

**Step 5: Commit**

```bash
git add src/app/projects/[id]/page.tsx
git commit -m "fix: align budget actual mappings with fabrication and crating rules"
```

---

## Task 7: Update labor-rate display and fallback math to $41/hr

**Objective:** Remove stale $30/hr assumptions from UI and manual fallback calculations.

**Files:**
- Modify: `src/lib/constants.ts`
- Modify: `src/app/projects/[id]/page.tsx`
- Search for any remaining `30` labor-rate assumptions across the repo

**Step 1: Update shared constant**

Change:

```ts
export const LABOR_RATE = 30;
```

to:

```ts
export const LABOR_RATE = 41;
```

**Step 2: Update page text and fallback calculations**

Fix any text that says `$30/hr`.
Fix manual labor fallback cost math to use the shared constant only.

Examples to check:
- labor row helper text
- P&L card helper text
- manual labor drill-down detail labels
- any fallback budget calculations

**Step 3: Search the repo for stale references**

Run:

```bash
rg '\$30/hr|30/hr|= 30|\b30\b' src lib
```

Replace only true labor-rate assumptions, not unrelated numeric values.

**Step 4: Verify build**

Run:

```bash
npm run build
```

**Step 5: Commit**

```bash
git add src/lib/constants.ts src/app/projects/[id]/page.tsx src/lib/budget-formula.ts
git commit -m "fix: raise mdp labor rate baseline to 41 per hour"
```

---

## Task 8: Validate imported/legacy project behavior

**Objective:** Confirm legacy projects still render sensibly after the formula change.

**Files:**
- Modify if needed: `src/app/projects/[id]/page.tsx`
- Inspect only: existing project creation/import paths

**Step 1: Test a new project path**

Use a project created from HubSpot quote parsing and confirm:
- fabrication-derived L&M budget is populated
- crating budget shows separately if present
- graphics/storage remain outside L&M

**Step 2: Test a legacy project with manual/stored budgets**

Confirm existing stored `budget_hrs` / `budget_materials` projects still render without breakage.

**Step 3: Check fallback behavior**

Right now the project page has a fallback for legacy null budget values based on contract amount. Decide whether to:
- keep it temporarily for legacy rows only, or
- tighten it to avoid recreating the old contract-based logic visually

Preferred: keep fallback only as legacy compatibility, and document that new projects should no longer rely on it.

**Step 4: Commit any compatibility fix**

```bash
git add src/app/projects/[id]/page.tsx
git commit -m "fix: preserve legacy project budget rendering after sku budget change"
```

---

## Task 9: Full verification pass

**Objective:** Prove the new budget architecture works end-to-end.

**Files:**
- No new files required unless documenting findings

**Step 1: Run build**

```bash
npm run build
```

Expected: PASS.

**Step 2: Run any available tests**

If this repo has test commands, run the relevant subset and then full suite.

**Step 3: Manual verification checklist**

For a project with fabrication + crating + graphics + storage:
- [ ] fabrication subtotal is visible/used indirectly in L&M outputs
- [ ] labor budget no longer changes because of graphics/storage lines
- [ ] materials budget no longer changes because of graphics/storage lines
- [ ] crating appears as its own budget category
- [ ] storage stays in shipping
- [ ] graphics stays out of L&M
- [ ] labor hours are using $41/hr
- [ ] no duplicate category allocation in actuals table

**Step 4: Write a short implementation note**

Create a short markdown note under `docs/` if helpful, describing the new rule:
- L&M budgets derive from fabrication subtotal only
- graphics/storage/crating are excluded from L&M base
- crating is its own category
- labor hours use $41/hr

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: move mdp lm budgets to fabrication sku basis"
```

---

## Key files to touch

Primary implementation files:
- `src/lib/hubspot-quote-parser.ts`
- `src/lib/budget-formula.ts`
- `src/lib/constants.ts`
- `src/lib/types.ts`
- `src/app/api/webhooks/hubspot/route.ts`
- `src/app/projects/[id]/page.tsx`

Schema/migration files:
- `supabase/migrations/20260521_add_crating_budget_category.sql`

Reference files to inspect while implementing:
- `src/app/api/billcom/sync/route.ts`
- `src/lib/hubspot.ts`
- `supabase/migrations/20260327_budget_formula.sql`
- `supabase/migrations/20260327010000_budget_materials.sql`

---

## Rollout decision

Chosen rollout: **forward-only + manual recalc button**

Implementation intent:
- **New projects** use the new fabrication-SKU-based L&M budget logic automatically.
- **Existing active projects** keep their currently stored budget values unless a user explicitly triggers a manual recalculation.
- **Completed projects** remain frozen by default and are not mass-recalculated.
- Add a **manual recalc control** on the project detail flow so selected projects can be re-based onto the new SKU logic intentionally.
- Preserve legacy fallback behavior only as needed to avoid breaking old/null-budget projects visually during transition.

## Acceptance criteria

The change is done when all of these are true:

- L&M budgets are no longer derived from total contract amount.
- L&M budgets are derived from fabrication SKU subtotal.
- Labor hours use a $41/hr baseline.
- Graphics, storage, and crating are excluded from the L&M base.
- Crating is its own quote/budget category.
- Project actuals mapping matches the new category architecture.
- No category is double-counted across budget rows.
- Build passes and a real project page verifies correctly.
