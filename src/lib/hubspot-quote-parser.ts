import { createClient } from "@supabase/supabase-js";
import { HARDCODED_DEFAULT_PCTS, LABOR_RATE_PER_HR } from "@/lib/budget-formula";
import type { HubSpotLineItem } from "@/lib/hubspot";

// SKUs that map directly to a quote budget category
const SKU_MAP: Record<string, string> = {
  // Fabrication (feeds L&M budgets)
  "400100": "fabrication",
  // Design
  "400700": "design",
  "400701": "design",
  // Project Management
  "409000": "pm",
  "409001": "pm",
  // Shipping
  "400400": "shipping",
  "400401": "shipping",
  "400402": "shipping",
  "400403": "shipping",
  // Crating
  "400404": "crating",
  // I&D Labor
  "400200": "id_labor",
  "400201": "id_labor",
  "400202": "id_labor",
  "400203": "id_labor",
  "400204": "id_labor",
  "400205": "id_labor",
  "400300": "id_labor",
  "400301": "id_labor",
  "400302": "id_labor",
  "400303": "id_labor",
  "400305": "id_labor",
  "400306": "id_labor",
  "400310": "id_labor",
  "400311": "id_labor",
  "400313": "id_labor",
  "400600": "id_labor",
  "400601": "id_labor",
  "400602": "id_labor",
  "400603": "id_labor",
  "400604": "id_labor",
  "400605": "id_labor",
  "400606": "id_labor",
  "400607": "id_labor",
  "400608": "id_labor",
  "400609": "id_labor",
  "400610": "id_labor",
  "400611": "id_labor",
  // Travel
  "400900": "travel",
  "400901": "travel",
  "400902": "travel",
  "400903": "travel",
  "400904": "travel",
  "400906": "travel",
  "400907": "travel",
  "400908": "travel",
  "400909": "travel",
  // Flooring
  "400801": "flooring",
  // Props/Decor
  "400101": "props",
  // Equipment/Rental
  "408000": "equipment",
  "408001": "equipment",
  "408002": "equipment",
  "408003": "equipment",
};

// SKUs that roll into contractAmount only (graphics, storage)
const CONTRACT_AMOUNT_SKUS = new Set([
  "400800", // Graphics
  "400500", // Storage
  "400501",
  "400502",
]);

// Description-based overrides for fabrication-coded or unknown SKUs
const DESCRIPTION_KEYWORDS: Array<{ keywords: string[]; category: string }> = [
  { keywords: ["flooring", "floor", "vinyl floor"], category: "flooring" },
  { keywords: ["prop", "props", "decor", "factice", "sculpture", "foam sculpt"], category: "props" },
  { keywords: ["graphic", "graphics", "signage"], category: "design" },
  { keywords: ["equipment", "truss", "ballast", "rigging"], category: "equipment" },
];

export interface ParsedQuote {
  contractAmount: number;
  quotes: {
    fabrication: number;
    design: number;
    pm: number;
    shipping: number;
    crating: number;
    id_labor: number;
    travel: number;
    props: number;
    equipment: number;
    rental: number;
    flooring: number;
  };
  reclassified: Array<{ name: string; originalSku: string; toCategory: string }>;
}

export interface CalculatedBudgets {
  budget_hrs: number | null;
  budget_materials: number | null;
  budget_design: number | null;
  budget_pm: number | null;
  budget_shipping: number | null;
  budget_crating: number | null;
  budget_id_labor: number | null;
  budget_travel: number | null;
  budget_props: number | null;
  budget_equipment: number | null;
  budget_rental: number | null;
  budget_flooring: number | null;
}

function matchDescription(name: string): string | null {
  const lower = name.toLowerCase();
  for (const { keywords, category } of DESCRIPTION_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return null;
}

export function parseLineItems(lineItems: HubSpotLineItem[]): ParsedQuote {
  const quotes = {
    fabrication: 0,
    design: 0,
    pm: 0,
    shipping: 0,
    crating: 0,
    id_labor: 0,
    travel: 0,
    props: 0,
    equipment: 0,
    rental: 0,
    flooring: 0,
  };
  const reclassified: ParsedQuote["reclassified"] = [];
  let contractAmount = 0;

  for (const item of lineItems) {
    const { name, sku, amount } = item;
    contractAmount += amount;

    if (SKU_MAP[sku]) {
      const cat = SKU_MAP[sku] as keyof typeof quotes;
      quotes[cat] += amount;
    } else if (CONTRACT_AMOUNT_SKUS.has(sku)) {
      // Try to reclassify via description
      const cat = matchDescription(name);
      if (cat && cat in quotes) {
        quotes[cat as keyof typeof quotes] += amount;
        reclassified.push({ name, originalSku: sku, toCategory: cat });
      }
      // else: pure fabrication — already added to contractAmount above
    } else {
      // Unknown SKU — try description
      const cat = matchDescription(name);
      if (cat && cat in quotes) {
        quotes[cat as keyof typeof quotes] += amount;
      }
      // else: falls into contractAmount only
    }
  }

  return { contractAmount, quotes, reclassified };
}

async function fetchGlobalPcts(): Promise<Record<string, number>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data, error } = await supabase
      .from("budget_formula_settings")
      .select("category, default_pct");

    if (error || !data) throw new Error(error?.message ?? "No data");

    const pcts: Record<string, number> = {};
    for (const row of data as Array<{ category: string; default_pct: number }>) {
      pcts[row.category] = row.default_pct;
    }
    return pcts;
  } catch (err) {
    console.warn("[hubspot-quote-parser] Failed to fetch budget_formula_settings, using hardcoded defaults:", err);
    return HARDCODED_DEFAULT_PCTS;
  }
}

export async function calculateBudgets(parsed: ParsedQuote): Promise<CalculatedBudgets> {
  const pcts = await fetchGlobalPcts();

  const p = (key: string) => pcts[key] ?? HARDCODED_DEFAULT_PCTS[key] ?? 0;

  const contractAmount = parsed.contractAmount;
  const q = parsed.quotes;
  const fabricationSubtotal = q.fabrication;
  const laborBudgetDollars = fabricationSubtotal > 0 ? (fabricationSubtotal * p("labor") / 100) : 0;

  return {
    budget_hrs: fabricationSubtotal > 0 ? Math.round(laborBudgetDollars / LABOR_RATE_PER_HR) : null,
    budget_materials: fabricationSubtotal > 0 ? Math.round(fabricationSubtotal * p("materials") / 100) : null,
    budget_design: q.design > 0 ? Math.round(q.design * p("design") / 100) : null,
    budget_pm: q.pm > 0 ? Math.round(q.pm * p("pm") / 100) : null,
    budget_shipping: q.shipping > 0 ? Math.round(q.shipping * p("shipping") / 100) : null,
    budget_crating: q.crating > 0 ? Math.round(q.crating * p("crating") / 100) : null,
    budget_id_labor: q.id_labor > 0 ? Math.round(q.id_labor * p("id_labor") / 100) : null,
    budget_travel: q.travel > 0 ? Math.round(q.travel * p("travel") / 100) : null,
    budget_props: q.props > 0 ? Math.round(q.props * p("props") / 100) : null,
    budget_equipment: q.equipment > 0 ? Math.round(q.equipment * p("equipment") / 100) : null,
    budget_rental: q.rental > 0 ? Math.round(q.rental * p("rental") / 100) : null,
    budget_flooring: q.flooring > 0 ? Math.round(q.flooring * p("flooring") / 100) : null,
  };
}
