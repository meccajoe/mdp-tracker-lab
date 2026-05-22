import { HARDCODED_DEFAULT_PCTS, LABOR_RATE_PER_HR } from "@/lib/budget-formula";

export type QuoteBackedProject = {
  [key: string]: number | string | null | undefined;
};

const CATEGORY_CONFIG = [
  { key: "design", label: "Design", quoteKey: "quote_design", budgetKey: "budget_design", pctKey: "pct_design" },
  { key: "pm", label: "Project Management", quoteKey: "quote_pm", budgetKey: "budget_pm", pctKey: "pct_pm" },
  { key: "shipping", label: "Shipping", quoteKey: "quote_shipping", budgetKey: "budget_shipping", pctKey: "pct_shipping" },
  { key: "crating", label: "Crating", quoteKey: "quote_crating", budgetKey: "budget_crating", pctKey: "pct_crating" },
  { key: "id_labor", label: "I&D Labor", quoteKey: "quote_id_labor", budgetKey: "budget_id_labor", pctKey: "pct_id_labor" },
  { key: "travel", label: "Travel", quoteKey: "quote_travel", budgetKey: "budget_travel", pctKey: "pct_travel" },
  { key: "props", label: "Props/Decor", quoteKey: "quote_props", budgetKey: "budget_props", pctKey: "pct_props" },
  { key: "equipment", label: "Equipment", quoteKey: "quote_equipment", budgetKey: "budget_equipment", pctKey: "pct_equipment" },
  { key: "rental", label: "Rental", quoteKey: "quote_rental", budgetKey: "budget_rental", pctKey: "pct_rental" },
  { key: "flooring", label: "Flooring/Graphics", quoteKey: "quote_flooring", budgetKey: "budget_flooring", pctKey: "pct_flooring" },
] as const;

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pct(project: QuoteBackedProject, key: string): number {
  const override = num(project[key]);
  return override ?? HARDCODED_DEFAULT_PCTS[key] ?? 0;
}

function budgetFromQuote(quote: number | null, percent: number): number | null {
  if (!quote || quote <= 0) return null;
  return Math.round((quote * percent) / 100);
}

export function buildStoredQuoteSnapshotFromParsedQuote(parsed: {
  quotes: Record<string, number>;
}) {
  return {
    quote_labor: null,
    quote_materials: num(parsed.quotes.fabrication) ?? 0,
    quote_design: num(parsed.quotes.design),
    quote_pm: num(parsed.quotes.pm),
    quote_shipping: num(parsed.quotes.shipping),
    quote_crating: num(parsed.quotes.crating),
    quote_id_labor: num(parsed.quotes.id_labor),
    quote_travel: num(parsed.quotes.travel),
    quote_props: num(parsed.quotes.props),
    quote_equipment: num(parsed.quotes.equipment),
    quote_rental: num(parsed.quotes.rental),
    quote_flooring: num(parsed.quotes.flooring),
  };
}

export function buildBudgetPayloadFromProjectQuote(project: QuoteBackedProject) {
  const fabricationBasis = num(project.quote_materials);
  const laborPct = pct(project, "pct_labor");
  const materialsPct = pct(project, "pct_materials");

  const payload: Record<string, number | null> = {
    budget_hrs: fabricationBasis && fabricationBasis > 0
      ? Math.round(((fabricationBasis * laborPct) / 100) / LABOR_RATE_PER_HR)
      : null,
    budget_materials: fabricationBasis && fabricationBasis > 0
      ? Math.round((fabricationBasis * materialsPct) / 100)
      : null,
  };

  for (const category of CATEGORY_CONFIG) {
    payload[category.budgetKey] = budgetFromQuote(num(project[category.quoteKey]), pct(project, category.pctKey));
  }

  return payload;
}

export function buildQuoteCompareRows(
  project: QuoteBackedProject,
  actuals: Record<string, number> = {}
) {
  const budgets = buildBudgetPayloadFromProjectQuote(project);
  const fabricationBasis = num(project.quote_materials) ?? 0;
  const laborPct = pct(project, "pct_labor");
  const materialsPct = pct(project, "pct_materials");

  const derivedLaborBudget = (budgets.budget_hrs ?? 0) * LABOR_RATE_PER_HR;
  const derivedMaterialsBudget = budgets.budget_materials ?? 0;

  const rows = [
    {
      category: "L&M",
      quote_basis_total: derivedLaborBudget + derivedMaterialsBudget,
      budget_total: derivedLaborBudget + derivedMaterialsBudget,
      actual_total: (actuals["Labor Hours"] ?? 0) * LABOR_RATE_PER_HR + (actuals.Materials ?? 0),
    },
    ...CATEGORY_CONFIG.map((category) => ({
      category: category.label,
      quote_basis_total: budgetFromQuote(num(project[category.quoteKey]), pct(project, category.pctKey)) ?? 0,
      budget_total: num(project[category.budgetKey]) ?? budgets[category.budgetKey] ?? 0,
      actual_total: actuals[category.label] ?? 0,
    })),
  ];

  return rows.map((row) => ({
    ...row,
    variance_quote_to_budget: row.quote_basis_total - row.budget_total,
    variance_budget_to_actual: row.budget_total - row.actual_total,
  }));
}
