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
  { key: "storage", label: "Storage", quoteKey: "quote_storage", budgetKey: "budget_storage", pctKey: "pct_storage" },
  { key: "props", label: "Props/Decor", quoteKey: "quote_props", budgetKey: "budget_props", pctKey: "pct_props" },
  { key: "equipment", label: "Equipment", quoteKey: "quote_equipment", budgetKey: "budget_equipment", pctKey: "pct_equipment" },
  { key: "rental", label: "Rental", quoteKey: "quote_rental", budgetKey: "budget_rental", pctKey: "pct_rental" },
  { key: "flooring", label: "Flooring/Graphics", quoteKey: "quote_flooring", budgetKey: "budget_flooring", pctKey: "pct_flooring" },
] as const;

type SupportedCategoryKey = typeof CATEGORY_CONFIG[number]["key"];

const CATEGORY_BY_KEY = new Map<SupportedCategoryKey, typeof CATEGORY_CONFIG[number]>(
  CATEGORY_CONFIG.map((category) => [category.key, category])
);

export type QuoteLineBudgetAllocationSource = {
  source_line_item_id: string;
  sku: string;
  item: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  mapped_category: string | null;
};

export type QuoteLineBudgetAllocationRow = QuoteLineBudgetAllocationSource & {
  budget_category_label: string;
  formula_type: "fabrication" | "graphics" | "bematrix" | "standard";
  formula_status: "ready" | "needs_sqft";
  labor_hours: number;
  labor_budget: number;
  material_budget: number;
  non_lm_budget: number;
};

const INTERNAL_LABOR_COST_PER_HOUR = 41;
const BEMATRIX_SKU = "408004";
const GRAPHICS_SKU = "400800";
const MARLEY_SKU = "400801";
const GRAPHICS_MATERIAL_RATE_PER_SQFT = 6.5;
const MARLEY_MATERIAL_RATE_PER_SQFT = 22;

function parseSquareFeet(description: string): number | null {
  const match = description.match(/(?:sq\.?\s*ft\.?|sqft|square\s*feet|sf)\s*[:=]?\s*(\d+(?:\.\d+)?)/i)
    ?? description.match(/(\d+(?:\.\d+)?)\s*(?:sq\.?\s*ft\.?|sqft|square\s*feet|sf)\b/i);
  const squareFeet = match ? Number(match[1]) : NaN;
  return Number.isFinite(squareFeet) && squareFeet > 0 ? squareFeet : null;
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pct(project: QuoteBackedProject, key: string): number {
  const override = num(project[key]);
  if (override != null) return override;

  const normalizedKey = key.startsWith("pct_") ? key.slice(4) : key;
  return HARDCODED_DEFAULT_PCTS[normalizedKey] ?? 0;
}

function budgetFromQuote(quote: number | null, percent: number): number | null {
  if (!quote || quote <= 0) return null;
  return Math.round((quote * percent) / 100);
}

export function getSkuChipClassName(sku: string | null | undefined): string {
  if (!sku) {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  if (sku === "400100") return "border-sky-200 bg-sky-100 text-sky-800";
  if (sku === "400101") return "border-pink-200 bg-pink-100 text-pink-800";
  if (sku === "400700" || sku === "400701") return "border-violet-200 bg-violet-100 text-violet-800";
  if (sku === "409000" || sku === "409001") return "border-rose-200 bg-rose-100 text-rose-800";
  if (["400400", "400401", "400402", "400403"].includes(sku)) return "border-amber-200 bg-amber-100 text-amber-800";
  if (sku === "400404") return "border-orange-200 bg-orange-100 text-orange-800";
  if (["400500", "400501", "400502"].includes(sku)) return "border-stone-200 bg-stone-100 text-stone-800";
  if (/^400(20\d|30\d|31[013]|60\d|61[01])$/.test(sku)) return "border-emerald-200 bg-emerald-100 text-emerald-800";
  if (/^40090\d$/.test(sku)) return "border-cyan-200 bg-cyan-100 text-cyan-800";
  if (sku === "400800" || sku === "400801") return "border-indigo-200 bg-indigo-100 text-indigo-800";
  if (/^40800\d$/.test(sku)) return "border-teal-200 bg-teal-100 text-teal-800";

  return "border-slate-200 bg-slate-100 text-slate-700";
}

const BUDGET_BREAKDOWN_TOTAL_MAP: Record<string, string> = {
  budget_hrs: "quote_materials",
  budget_materials: "quote_materials",
  budget_design: "quote_design",
  budget_pm: "quote_pm",
  budget_shipping: "quote_shipping",
  budget_crating: "quote_crating",
  budget_id_labor: "quote_id_labor",
  budget_travel: "quote_travel",
  budget_storage: "quote_storage",
  budget_props: "quote_props",
  budget_equipment: "quote_equipment",
  budget_rental: "quote_rental",
  budget_flooring: "quote_flooring",
};

export function buildBudgetBreakdownTotal<T extends object>(project: T, budgetKey: string): number {
  const quoteKey = BUDGET_BREAKDOWN_TOTAL_MAP[budgetKey];
  if (!quoteKey) return 0;
  return num((project as Record<string, unknown>)[quoteKey]) ?? 0;
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
    quote_storage: num(parsed.quotes.storage),
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

export function buildHubspotQuoteSyncFields(parsed: { quotes: Record<string, number> }): ReturnType<typeof buildStoredQuoteSnapshotFromParsedQuote> & ReturnType<typeof buildBudgetPayloadFromProjectQuote> {
  const quoteSnapshot = buildStoredQuoteSnapshotFromParsedQuote(parsed);
  const budgets = buildBudgetPayloadFromProjectQuote(quoteSnapshot);
  return {
    ...quoteSnapshot,
    ...budgets,
  };
}

const UNSUPPORTED_PROJECT_FIELDS = new Set([
  "quote_crating",
  "budget_crating",
  "pct_crating",
]);

export function stripUnsupportedProjectFields<T extends Record<string, unknown>>(payload: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !UNSUPPORTED_PROJECT_FIELDS.has(key))
  ) as Partial<T>;
}

export function buildQuoteCompareRows(
  project: QuoteBackedProject,
  actuals: Record<string, number> = {}
) {
  const budgets = buildBudgetPayloadFromProjectQuote(project);

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

export function buildQuoteLineBudgetAllocationRows(
  project: QuoteBackedProject,
  lineItems: QuoteLineBudgetAllocationSource[]
): QuoteLineBudgetAllocationRow[] {
  return lineItems.map((lineItem) => {
    if (lineItem.sku === BEMATRIX_SKU) {
      const laborHours = lineItem.quantity / 2.4;
      return { ...lineItem, budget_category_label: "BeMatrix frames", formula_type: "bematrix", formula_status: "ready", labor_hours: laborHours, labor_budget: Math.round(laborHours * INTERNAL_LABOR_COST_PER_HOUR), material_budget: 0, non_lm_budget: 0 };
    }

    if (lineItem.sku === GRAPHICS_SKU || lineItem.sku === MARLEY_SKU) {
      const isMarley = lineItem.sku === MARLEY_SKU;
      const squareFeet = parseSquareFeet(lineItem.description);
      const label = isMarley ? "Marley flooring" : "Graphics";
      if (!squareFeet) return { ...lineItem, budget_category_label: `${label} — needs SQFT`, formula_type: "graphics", formula_status: "needs_sqft", labor_hours: 0, labor_budget: 0, material_budget: 0, non_lm_budget: 0 };
      const laborHours = Math.max(0, (lineItem.line_total - squareFeet * 25) / 105);
      const materialRate = isMarley ? MARLEY_MATERIAL_RATE_PER_SQFT : GRAPHICS_MATERIAL_RATE_PER_SQFT;
      return { ...lineItem, budget_category_label: `${label} · ${squareFeet} SQFT`, formula_type: "graphics", formula_status: "ready", labor_hours: laborHours, labor_budget: Math.round(laborHours * INTERNAL_LABOR_COST_PER_HOUR), material_budget: Math.round(squareFeet * materialRate), non_lm_budget: 0 };
    }

    if (lineItem.mapped_category === "fabrication") {
      const laborHours = lineItem.line_total / 210;
      return { ...lineItem, budget_category_label: "Fabrication", formula_type: "fabrication", formula_status: "ready", labor_hours: laborHours, labor_budget: Math.round(laborHours * INTERNAL_LABOR_COST_PER_HOUR), material_budget: Math.round(lineItem.line_total / 4), non_lm_budget: 0 };
    }

    const normalizedCategory = lineItem.mapped_category as SupportedCategoryKey | null;
    const category = normalizedCategory ? CATEGORY_BY_KEY.get(normalizedCategory) : null;
    const nonLmBudget = category ? Math.round((lineItem.line_total * pct(project, category.pctKey)) / 100) : 0;
    return { ...lineItem, budget_category_label: category?.label ?? "Unmapped", formula_type: "standard", formula_status: "ready", labor_hours: 0, labor_budget: 0, material_budget: 0, non_lm_budget: nonLmBudget };
  });
}
