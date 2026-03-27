export const HARDCODED_DEFAULT_PCTS: Record<string, number> = {
  labor: 25,
  materials: 25,
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

export const BUDGET_CATEGORIES = [
  { key: "design",    label: "Design",            quoteKey: "quote_design",    budgetKey: "budget_design",    pctKey: "pct_design" },
  { key: "pm",        label: "Project Management", quoteKey: "quote_pm",        budgetKey: "budget_pm",        pctKey: "pct_pm" },
  { key: "shipping",  label: "Shipping",           quoteKey: "quote_shipping",  budgetKey: "budget_shipping",  pctKey: "pct_shipping" },
  { key: "id_labor",  label: "I&D Labor",          quoteKey: "quote_id_labor",  budgetKey: "budget_id_labor",  pctKey: "pct_id_labor" },
  { key: "travel",    label: "Travel",             quoteKey: "quote_travel",    budgetKey: "budget_travel",    pctKey: "pct_travel" },
  { key: "props",     label: "Props/Decor",        quoteKey: "quote_props",     budgetKey: "budget_props",     pctKey: "pct_props" },
  { key: "equipment", label: "Equipment",          quoteKey: "quote_equipment", budgetKey: "budget_equipment", pctKey: "pct_equipment" },
  { key: "flooring",  label: "Flooring",           quoteKey: "quote_flooring",  budgetKey: "budget_flooring",  pctKey: "pct_flooring" },
] as const;

export type BudgetCategory = typeof BUDGET_CATEGORIES[number];

export function calcBudget(quote: number | null | undefined, pct: number): number | null {
  if (!quote) return null;
  return Math.round(quote * pct / 100);
}

export function calcLaborHrs(contractAmount: number | null | undefined, pct: number): number | null {
  if (!contractAmount) return null;
  return Math.round((contractAmount * pct / 100) / LABOR_RATE_PER_HR);
}

export function calcMaterialsBudget(contractAmount: number | null | undefined, pct: number): number | null {
  if (!contractAmount) return null;
  return Math.round(contractAmount * pct / 100);
}
