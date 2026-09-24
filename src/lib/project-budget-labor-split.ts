import { getLaborWorkGroup } from "./labor-service-item";

export const DESIGN_SELL_RATE = 125;
export const DESIGN_BUDGET_COST_RATE = 25;
export const SHOP_BUDGET_COST_RATE = 41;

type QboBudgetLaborEntry = {
  service_item?: string | null;
  reg_hours: number;
  ot_hours: number;
  hourly_rate: number;
};

type ManualBudgetLaborEntry = {
  labor_type?: string | null;
  hours: number;
};

type LaborBucket = {
  budgetHours: number;
  budgetCost: number;
  actualHours: number;
  actualCost: number;
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeLaborCode(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

export function isDesignLaborCode(value: string | null | undefined): boolean {
  return getLaborWorkGroup(normalizeLaborCode(value)) === "design";
}

export function buildProjectBudgetLaborSplit({
  quotedDesignDollars,
  shopBudgetHours,
  qboEntries,
  manualEntries,
}: {
  quotedDesignDollars: number | null | undefined;
  shopBudgetHours: number | null | undefined;
  qboEntries: QboBudgetLaborEntry[];
  manualEntries: ManualBudgetLaborEntry[];
}): { shop: LaborBucket; design: LaborBucket; install: LaborBucket; dismantle: LaborBucket; unclassified: LaborBucket } {
  const designBudgetHours = Math.max(0, Number(quotedDesignDollars) || 0) / DESIGN_SELL_RATE;
  const normalizedShopBudgetHours = Math.max(0, Number(shopBudgetHours) || 0);

  const design: LaborBucket = {
    budgetHours: round(designBudgetHours),
    budgetCost: round(designBudgetHours * DESIGN_BUDGET_COST_RATE),
    actualHours: 0,
    actualCost: 0,
  };
  const shop: LaborBucket = {
    budgetHours: round(normalizedShopBudgetHours),
    budgetCost: round(normalizedShopBudgetHours * SHOP_BUDGET_COST_RATE),
    actualHours: 0,
    actualCost: 0,
  };
  const install: LaborBucket = { budgetHours: 0, budgetCost: 0, actualHours: 0, actualCost: 0 };
  const dismantle: LaborBucket = { budgetHours: 0, budgetCost: 0, actualHours: 0, actualCost: 0 };
  const unclassified: LaborBucket = { budgetHours: 0, budgetCost: 0, actualHours: 0, actualCost: 0 };
  const buckets = { shop, design, install, dismantle, unclassified };

  for (const entry of qboEntries) {
    const hours = Math.max(0, Number(entry.reg_hours) || 0) + Math.max(0, Number(entry.ot_hours) || 0);
    const bucket = buckets[getLaborWorkGroup(entry.service_item)];
    bucket.actualHours += hours;
    bucket.actualCost += hours * Math.max(0, Number(entry.hourly_rate) || 0);
  }

  for (const entry of manualEntries) {
    const hours = Math.max(0, Number(entry.hours) || 0);
    const group = getLaborWorkGroup(entry.labor_type);
    const bucket = buckets[group];
    bucket.actualHours += hours;
    bucket.actualCost += hours * (group === "design" ? DESIGN_BUDGET_COST_RATE : SHOP_BUDGET_COST_RATE);
  }

  design.actualHours = round(design.actualHours);
  design.actualCost = round(design.actualCost);
  shop.actualHours = round(shop.actualHours);
  shop.actualCost = round(shop.actualCost);
  install.actualHours = round(install.actualHours);
  install.actualCost = round(install.actualCost);
  dismantle.actualHours = round(dismantle.actualHours);
  dismantle.actualCost = round(dismantle.actualCost);
  unclassified.actualHours = round(unclassified.actualHours);
  unclassified.actualCost = round(unclassified.actualCost);

  return buckets;
}
