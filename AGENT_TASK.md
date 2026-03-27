# Budget Formula System — Build Task

You are working on the MDP Project Tracker app at /Users/archie/projects/mdp-tracker. This is a Next.js 14 + Supabase app. Do NOT run the dev server. Build, then restart PM2.

## TASK OVERVIEW

Replace the flat budget input fields in the Data Entry Hub with a Quote → Budget formula system, add a Pending project status, and add a global settings page for default percentages.

---

## 1. Database Migration

Create file: `supabase/migrations/20260327_budget_formula.sql`

```sql
-- Add quote columns (what Emily enters from the proposal)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_design numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_pm numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_shipping numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_id_labor numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_travel numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_props numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_equipment numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_flooring numeric(10,2);

-- Per-project percentage overrides (null = use global default)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_design numeric(5,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_pm numeric(5,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_shipping numeric(5,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_id_labor numeric(5,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_travel numeric(5,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_props numeric(5,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_equipment numeric(5,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_flooring numeric(5,2);

-- Global default percentages table
CREATE TABLE IF NOT EXISTS budget_formula_settings (
  category text PRIMARY KEY,
  label text NOT NULL,
  default_pct numeric(5,2) NOT NULL,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO budget_formula_settings (category, label, default_pct) VALUES
  ('design', 'Design', 50),
  ('pm', 'Project Management', 75),
  ('shipping', 'Shipping', 70),
  ('id_labor', 'I&D Labor', 60),
  ('travel', 'Travel', 75),
  ('props', 'Props/Decor', 50),
  ('equipment', 'Equipment', 60),
  ('flooring', 'Flooring', 65)
ON CONFLICT (category) DO NOTHING;

ALTER TABLE budget_formula_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Authenticated users can manage budget formula settings"
  ON budget_formula_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add Pending status
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('Active', 'Completed', 'On Hold', 'Pending'));
```

Apply this migration. First check if `npx supabase` CLI is available (`npx supabase --version`). If yes, run `npx supabase db push`. If not, apply the SQL directly using a small Node/TS script using the service role key from .env.local via the Supabase REST API. The DATABASE_URL for direct postgres connection might be available — check .env.local. Use whatever works. The Supabase project ref is `yaftybqzlbbvzwwdzlny`.

---

## 2. Update `src/lib/types.ts`

Add these fields to the Project interface:
```typescript
// Quote amounts (admin-only, not shown to PMs)
quote_design: number | null;
quote_pm: number | null;
quote_shipping: number | null;
quote_id_labor: number | null;
quote_travel: number | null;
quote_props: number | null;
quote_equipment: number | null;
quote_flooring: number | null;
// Per-project % overrides (null = use global default)
pct_design: number | null;
pct_pm: number | null;
pct_shipping: number | null;
pct_id_labor: number | null;
pct_travel: number | null;
pct_props: number | null;
pct_equipment: number | null;
pct_flooring: number | null;
```

Also add 'Pending' to the status type union.

---

## 3. Create `src/lib/budget-formula.ts`

```typescript
export const HARDCODED_DEFAULT_PCTS: Record<string, number> = {
  design: 50,
  pm: 75,
  shipping: 70,
  id_labor: 60,
  travel: 75,
  props: 50,
  equipment: 60,
  flooring: 65,
};

export const LABOR_RATE_PER_HR = 30;
export const LABOR_MATERIALS_PCT = 0.25; // 25% of contract amount each

export const BUDGET_CATEGORIES = [
  { key: 'design',    label: 'Design',            quoteKey: 'quote_design',    budgetKey: 'budget_design',    pctKey: 'pct_design' },
  { key: 'pm',        label: 'Project Management', quoteKey: 'quote_pm',        budgetKey: 'budget_pm',        pctKey: 'pct_pm' },
  { key: 'shipping',  label: 'Shipping',           quoteKey: 'quote_shipping',  budgetKey: 'budget_shipping',  pctKey: 'pct_shipping' },
  { key: 'id_labor',  label: 'I&D Labor',          quoteKey: 'quote_id_labor',  budgetKey: 'budget_id_labor',  pctKey: 'pct_id_labor' },
  { key: 'travel',    label: 'Travel',             quoteKey: 'quote_travel',    budgetKey: 'budget_travel',    pctKey: 'pct_travel' },
  { key: 'props',     label: 'Props/Decor',        quoteKey: 'quote_props',     budgetKey: 'budget_props',     pctKey: 'pct_props' },
  { key: 'equipment', label: 'Equipment',          quoteKey: 'quote_equipment', budgetKey: 'budget_equipment', pctKey: 'pct_equipment' },
  { key: 'flooring',  label: 'Flooring',           quoteKey: 'quote_flooring',  budgetKey: 'budget_flooring',  pctKey: 'pct_flooring' },
] as const;

export function calcBudget(quote: number | null | undefined, pct: number): number | null {
  if (!quote) return null;
  return Math.round(quote * pct / 100);
}

export function calcLaborHrs(contractAmount: number | null | undefined): number | null {
  if (!contractAmount) return null;
  return Math.round((contractAmount * LABOR_MATERIALS_PCT) / LABOR_RATE_PER_HR);
}

export function calcMaterialsBudget(contractAmount: number | null | undefined): number | null {
  if (!contractAmount) return null;
  return Math.round(contractAmount * LABOR_MATERIALS_PCT);
}
```

---

## 4. Rewrite Budget Section in `src/app/admin/data-entry/page.tsx`

### State additions
Add to the component state:
```typescript
const [globalPcts, setGlobalPcts] = useState<Record<string, number>>(HARDCODED_DEFAULT_PCTS);
// Quote amounts entered by Emily
const [quotes, setQuotes] = useState<Record<string, string>>({});
// Per-project % overrides (empty string = use global default)
const [projectPcts, setProjectPcts] = useState<Record<string, string>>({});
// Manual budget overrides (empty string = use formula result)
const [budgetOverrides, setBudgetOverrides] = useState<Record<string, string>>({});
```

On mount, fetch global pcts from `budget_formula_settings` table. If fetch fails, use HARDCODED_DEFAULT_PCTS.

When opening a project for edit, populate:
- `quotes` from project's quote_* fields
- `projectPcts` from project's pct_* fields (convert to string, empty if null)
- `budgetOverrides` from project's budget_* fields ONLY if there's no corresponding quote (i.e., existing projects that were entered before this system)

### New BudgetFormulaSection component (inline in the file)

Replace the current budget fields grid (Rows 3-5 in the form) with this component.

For each category in BUDGET_CATEGORIES, render a row:

```
[Category Label]
Quote $: [input]   →   [effective_pct]% [↺ reset if overridden]   =   $[calculated] (green)   |   Budget Override: [input, optional] [✏ overridden badge if set]
```

Layout: use a clean card/section style. Each category gets its own row with:
- Category label (bold, left)
- Quote $ input (number input, medium width)
- Arrow "→" 
- Pct% input (small, ~60px wide) showing effective pct. If the project has a pct override, show it; else show global default. If overridden, show a small "↺" button that clears the override back to global.
- "=" sign
- Calculated budget display: `formatCurrency(calcBudget(quote, effectivePct))` in green/emerald text. Shows "—" if no quote.
- Optional "Override" input: if Emily types here, this value is used instead of the formula. Show a small amber "✏ manual" badge when active. Show an "✕" to clear the override.

Labor & Materials section (separate subsection below non-L&M):
- "Labor (from contract)" row:
  - Shows auto-calculated: `contract × 25% ÷ $30/hr = X hrs = $Y`  
  - budget_hrs input with the auto-calc as placeholder
  - Manual override allowed
- "Materials (from contract)" row: 
  - Shows auto-calculated: `contract × 25% = $Z`
  - This maps to... actually materials don't have a direct budget field currently. Store in budget_props? No — leave materials as a display-only calculated value shown to Emily for reference. The actual materials tracking comes through expense categories. Just show it as an informational line.
  - Actually: add a `budget_materials` column IF you can, OR just use the calculated value for display and save it nowhere for now. Keep it simple — show the calculation as info only.

### On save
When saving a project, compute the final budget values:
```
For each category:
  budgetValue = budgetOverrides[key] || calcBudget(quotes[key], effectivePct)
  
Save to project:
  budget_design = budgetValue for design
  budget_pm = budgetValue for pm
  ... etc.
  
  quote_design = quotes.design (as number)
  quote_pm = quotes.pm
  ... etc.
  
  pct_design = projectPcts.design (if set, as number; else null)
  ... etc.
  
  budget_hrs = budgetOverrides.labor_hrs || calcLaborHrs(contract_amount)
```

---

## 5. Add Pending Status

In `src/app/admin/data-entry/page.tsx`:
- Add `Pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400"` to STATUS_COLORS
- Add `<option value="Pending">Pending</option>` to the status dropdown

In `src/app/page.tsx` (dashboard):
- The dashboard already filters to Active only (`p.status === "Active"`) — this is correct, keep it
- Add "Pending" to the PM filter tags area? No — keep dashboard clean. Pending projects appear in the Data Entry Hub list only.

---

## 6. New Admin Settings Page: `src/app/admin/settings/page.tsx`

Simple page for admins to edit global default percentages.

```tsx
"use client";
// Fetch budget_formula_settings from Supabase
// Display as a table: Category | Default % | Edit
// Inline edit: click % → input → save
// Show "Using hardcoded defaults" notice if table doesn't exist
// Admin-only (check user_roles)
```

---

## 7. Add Settings link to Sidebar

In `src/components/Sidebar.tsx`, inside the Settings section (already exists), add:
```tsx
<NavLink href="/admin/settings" label="Settings" icon={settingsIcon} collapsed={collapsed} exact={false} />
```
Add this alongside the existing Data Entry, Purchasing, Users links.

---

## 8. Build & Deploy

```bash
cd /Users/archie/projects/mdp-tracker
npm run build
pm2 restart mdp-tracker
git add -A && git commit -m "feat: budget formula system — quote→budget calc, per-project % overrides, Pending status, global settings page"
```

---

## IMPORTANT NOTES

- Do NOT break existing functionality. Projects without quote amounts still work — budget fields just show as-is.
- The migration uses IF NOT EXISTS everywhere so it's safe to run multiple times.
- Quote amounts are ADMIN ONLY — they do not appear on `/projects/[id]` page or anywhere non-admins can see.
- Budget values (budget_design etc.) continue to feed the project summary view exactly as before.
- Keep the existing actuals section in the data entry form — don't remove it.
- The notes field stays as-is (single field, visible to all on project page).
