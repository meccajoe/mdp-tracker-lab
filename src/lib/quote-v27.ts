import type {CapacityOverride} from './capacity';
import type {QuoteSchedule} from './quote-schedule';
import { calculateEstimators, type Estimators } from './quote-v27-estimators.ts';
/** Pure v27 workbook calculations. No live catalog, persistence, or integration calls. */
export const LINE_TYPES = [
  "Fabrication", "Graphics", "beMatrix / SEG", "Design / Engineering / CAD",
  "Lead Installer — Install", "Lead Installer — Dismantle", "Off Days — Lead",
  "Off Days — Support", "Install Support Labor", "Travel — Lead Installer",
  "Travel — Project Manager", "Travel — Install Support", "Stage / Pack / Prep",
  "Disposal", "Equipment Rental", "Props / Resale", "Travel & Expenses", "Freight",
  "Installer Days", "Project Management Fee",
] as const;
export type LineType = typeof LINE_TYPES[number];
export type Inputs = {
  materials: number; resale: number; hours: number; days: number; sqft: number;
  panels: number; rental: number; siteDays: number; travelDays: number; cost: number;
};
export type Settings = {
  contingency: number; opex: number; indirect: number; laborSell: number;
  materialMarkup: number; shopDay: number; efficiency: number; graphicsSell: number;
  graphicsCost: number; handlingMinutes: number; handlingCrew: number; designSell: number;
  pmFee: number; pmBonus: number; leadDay: number; supportDay: number;
  travelFactor: number; pmTravelDay: number; siteHours: number; supportCost: number;
  offFactor: number; equipmentMarkup: number; resaleMarkup: number; travelMarkup: number;
  freightMarkup: number; burdenMultiplier: number; burdenedRateOverride: number | null;
};
export type Trade = { id: string; name: string; wage: number | null };
export type Material = { id: string; name: string; unit: string; unitCost: number; source?: string };
export type Takeoff = {
  id: string; lineId: string; description: string; materialId: string | null;
  tradeId: string | null; quantity: number; sections: number | null;
  unitCostOverride: number | null; hours: number; resale: boolean;
  unit?: string; notes?: string;
};
export type QuoteLine = {
  id: string; name: string; type: LineType; takeoffDriven: boolean;
  inputs: Inputs; overrides: Partial<Record<keyof Inputs, number | null>>;
  priceOverride: number | null; source?: string;
};
export type QuoteV27 = {
  importNotes?: string[];
  schedule?: QuoteSchedule;
  planning?: CapacityOverride;
  estimators?: Estimators;
  reusableItemIds?: string[];
  catalogUsage?: Record<string,number>;
  schemaVersion: 1; assumptionsVersion: string; commission: number;
  settings: Settings; trades: Trade[]; catalog: Material[];
  takeoffs: Takeoff[]; lines: QuoteLine[];
};
export const EMPTY_INPUTS: Inputs = {
  materials: 0, resale: 0, hours: 0, days: 0, sqft: 0, panels: 0,
  rental: 0, siteDays: 0, travelDays: 0, cost: 0,
};

function nonnegative(value: number, name: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(`${name} must be a finite nonnegative number.`);
}
function unique<T extends { id: string }>(rows: T[], name: string) {
  const map = new Map(rows.map(row => [row.id, row]));
  if (map.size !== rows.length || rows.some(row => !row.id)) throw new Error(`${name} IDs must be unique and nonempty.`);
  return map;
}

/** Preserve full precision until display, except Excel's two-decimal blended labor rate. */
export function calculateQuoteV27(quote: QuoteV27) {
  if (quote.schemaVersion !== 1 || !quote.assumptionsVersion) throw new Error("Unsupported quote snapshot version.");
  const estimatorResult = quote.estimators ? calculateEstimators(quote, quote.estimators) : null;
  const s = quote.settings;
  for (const [key, value] of Object.entries(s)) {
    if (key === "burdenedRateOverride" && value === null) continue;
    nonnegative(value as number, key);
  }
  if (s.efficiency === 0) throw new Error("Task-hour efficiency must be greater than zero.");
  for (const key of ["contingency", "opex", "indirect", "pmFee", "pmBonus"] as const)
    if (s[key] > 1) throw new Error(`${key} must be at most 100%.`);
  nonnegative(quote.commission, "Commission");
  if (quote.commission >= 1) throw new Error("Commission must be less than 100%.");
  const catalog = unique(quote.catalog, "Material");
  const trades = unique(quote.trades, "Trade");
  const linesById = unique(quote.lines, "Line");
  unique(quote.takeoffs, "Takeoff");
  for (const material of quote.catalog) nonnegative(material.unitCost, "Catalog cost");
  const rates = quote.trades.flatMap(trade => {
    if (trade.wage === null) return [];
    nonnegative(trade.wage, "Trade wage");
    return trade.wage === 0 ? [] : [trade.wage * s.burdenMultiplier];
  });
  if (!rates.length && s.burdenedRateOverride === null) throw new Error("A burdened labor rate or nonzero trade wage is required.");
  const laborRate = s.burdenedRateOverride ?? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length + Number.EPSILON) * 100) / 100;
  const takeoffTotals = new Map<string, { materials: number; resale: number; hours: number; trades: Record<string, number> }>();
  const takeoffs = quote.takeoffs.map(row => {
    if (row.lineId && !linesById.has(row.lineId)) throw new Error(`Unknown takeoff line: ${row.lineId}`);
    if (row.tradeId !== null && !trades.has(row.tradeId)) throw new Error(`Unknown trade: ${row.tradeId}`);
    const material = row.materialId === null ? undefined : catalog.get(row.materialId);
    if (row.materialId !== null && !material) throw new Error(`Unknown material: ${row.materialId}`);
    for (const [key, value] of Object.entries({ quantity: row.quantity, sections: row.sections ?? 1, hours: row.hours, unitCost: row.unitCostOverride ?? material?.unitCost ?? 0 })) nonnegative(value, key);
    if (row.quantity > 0 && !material && row.unitCostOverride === null) throw new Error(`Takeoff ${row.id} needs a catalog material or explicit cost.`);
    const unitCost = row.unitCostOverride ?? material?.unitCost ?? 0;
    const cost = row.quantity * unitCost * (row.sections ?? 1);
    const hours = row.hours * (row.sections ?? 1);
    const total = takeoffTotals.get(row.lineId) ?? { materials: 0, resale: 0, hours: 0, trades: {} };
    total[row.resale ? "resale" : "materials"] += cost;
    total.hours += hours;
    if (row.tradeId !== null) total.trades[row.tradeId] = (total.trades[row.tradeId] ?? 0) + hours;
    if (row.lineId) takeoffTotals.set(row.lineId, total);
    return { ...row, calculatedUnitCost: material?.unitCost ?? 0, unitCost, cost, extendedHours: hours };
  });
  if (quote.lines.filter(line => line.type === "Project Management Fee").length > 1) throw new Error("Only one project management fee line is supported.");

  const lines = quote.lines.map(line => {
    if (!(LINE_TYPES as readonly string[]).includes(line.type)) throw new Error(`Unsupported line type: ${line.type}`);
    const total = takeoffTotals.get(line.id);
    const calculatedInputs = { ...line.inputs };
    if (line.takeoffDriven) {
      calculatedInputs.materials = total?.materials ?? 0;
      calculatedInputs.resale = total?.resale ?? 0;
      calculatedInputs.hours = total?.hours ?? 0;
    }
    Object.assign(calculatedInputs, estimatorResult?.lineInputs[line.id] ?? {});
    const input = { ...calculatedInputs };
    for (const key of Object.keys(EMPTY_INPUTS) as (keyof Inputs)[]) {
      nonnegative(calculatedInputs[key], `${line.id}.${key}`);
      input[key] = line.overrides[key] ?? calculatedInputs[key];
      nonnegative(input[key], `${line.id}.${key} override`);
    }
    if (line.priceOverride !== null) nonnegative(line.priceOverride, "Price override");
    const x = input;
    let price = 0, materialsBudget = 0, hoursAllowed = 0;
    switch (line.type) {
      case "Fabrication":
        price = x.materials * s.materialMarkup + x.resale * s.resaleMarkup + (x.hours > 0 ? x.hours : x.days * s.shopDay) * s.laborSell;
        materialsBudget = x.materials + x.resale;
        hoursAllowed = x.hours > 0 ? x.hours / s.efficiency : x.days * s.shopDay;
        break;
      case "Graphics":
        price = x.sqft * s.graphicsSell + x.hours * s.laborSell;
        materialsBudget = x.sqft * s.graphicsCost; hoursAllowed = x.hours; break;
      case "beMatrix / SEG":
        price = x.rental + x.sqft * s.graphicsSell; materialsBudget = x.sqft * s.graphicsCost;
        hoursAllowed = x.panels * s.handlingMinutes * s.handlingCrew / 60; break;
      case "Design / Engineering / CAD": price = x.hours * s.designSell; hoursAllowed = x.hours; break;
      case "Lead Installer — Install":
      case "Lead Installer — Dismantle": price = x.siteDays * s.leadDay; hoursAllowed = x.siteDays * s.siteHours; break;
      case "Off Days — Lead": price = x.siteDays * s.leadDay * s.offFactor; hoursAllowed = x.siteDays * s.siteHours; break;
      case "Off Days — Support": price = x.siteDays * s.supportDay * s.offFactor; hoursAllowed = x.siteDays * s.siteHours; break;
      case "Install Support Labor": price = x.cost; materialsBudget = x.siteDays * s.supportCost; break;
      case "Travel — Lead Installer": price = x.travelDays * s.leadDay * s.travelFactor; hoursAllowed = x.travelDays * s.siteHours; break;
      case "Travel — Project Manager": price = x.travelDays * s.pmTravelDay * s.travelFactor; hoursAllowed = x.travelDays * s.siteHours; break;
      case "Travel — Install Support": price = x.travelDays * s.supportDay * s.travelFactor; hoursAllowed = x.travelDays * s.siteHours; break;
      case "Stage / Pack / Prep": price = x.hours * s.laborSell; hoursAllowed = x.hours; break;
      case "Disposal": price = x.hours * s.laborSell + x.cost; materialsBudget = x.cost; hoursAllowed = x.hours; break;
      case "Equipment Rental": price = x.cost * s.equipmentMarkup; materialsBudget = x.cost; break;
      case "Props / Resale": materialsBudget = x.materials + x.resale + x.cost; price = materialsBudget * s.resaleMarkup; break;
      case "Travel & Expenses": price = x.cost * (1 + s.travelMarkup); materialsBudget = x.cost; break;
      case "Freight": price = x.cost * (1 + s.freightMarkup); materialsBudget = x.cost; break;
      case "Installer Days": price = x.cost; hoursAllowed = x.siteDays * s.siteHours; break;
      case "Project Management Fee": break; // Second pass: uses final hard-scope prices.
    }
    const calculatedPrice = price / (1 - quote.commission);
    const laborBudget = hoursAllowed * laborRate;
    // Do not silently rescale named trades when efficiency or input overrides differ.
    const tradeHours = { ...(total?.trades ?? {}) };
    const allocatedHours = Object.values(tradeHours).reduce((a, b) => a + b, 0);
    return { id: line.id, name: line.name, type: line.type, calculatedInputs, inputs: input,
      calculatedPrice, priceOverride: line.priceOverride, finalPrice: line.priceOverride ?? calculatedPrice,
      materialsBudget, hoursAllowed, laborBudget, buildBudget: materialsBudget + laborBudget,
      tradeHours, untypedHours: Math.max(0, hoursAllowed - allocatedHours),
      overallocatedTradeHours: Math.max(0, allocatedHours - hoursAllowed) };
  });
  const hardScope = lines.filter(line => !["Project Management Fee", "Travel & Expenses", "Freight"].includes(line.type)).reduce((sum, line) => sum + line.finalPrice, 0);
  for (const line of lines) if (line.type === "Project Management Fee") {
    // Template N36 applies the fee to already-grossed-up final prices; no second gross-up.
    line.calculatedPrice = hardScope * s.pmFee;
    line.finalPrice = line.priceOverride ?? line.calculatedPrice;
  }
  const pricedLines = lines.map(line => {
    const contingency = line.finalPrice * s.contingency;
    const indirect = line.finalPrice * s.indirect;
    const commission = line.finalPrice * quote.commission;
    const margin = line.finalPrice - line.buildBudget - contingency - indirect - commission;
    return { ...line, contingency, indirect, commission, margin, marginPercent: line.finalPrice === 0 ? null : margin / line.finalPrice };
  });
  const totals = pricedLines.reduce((sum, line) => ({
    price: sum.price + line.finalPrice, calculatedPrice: sum.calculatedPrice + line.calculatedPrice,
    materialsBudget: sum.materialsBudget + line.materialsBudget, hoursAllowed: sum.hoursAllowed + line.hoursAllowed,
    laborBudget: sum.laborBudget + line.laborBudget, buildBudget: sum.buildBudget + line.buildBudget,
    contingency: sum.contingency + line.contingency, indirect: sum.indirect + line.indirect,
    commission: sum.commission + line.commission, margin: sum.margin + line.margin,
  }), { price: 0, calculatedPrice: 0, materialsBudget: 0, hoursAllowed: 0, laborBudget: 0, buildBudget: 0, contingency: 0, indirect: 0, commission: 0, margin: 0 });
  const tradeHours: Record<string, number> = {};
  for (const line of lines) for (const [id, hours] of Object.entries(line.tradeHours)) tradeHours[id] = (tradeHours[id] ?? 0) + hours;
  const pmBonus = totals.margin * s.pmBonus, opex = totals.price * s.opex;
  for (const value of Object.values(totals)) if (!Number.isFinite(value)) throw new Error("Quote calculation exceeds numeric limits.");
  return { estimators: estimatorResult, laborRate, takeoffs, lines: pricedLines, tradeHours, totals: { ...totals, pmBonus, opex, netProfit: totals.margin - pmBonus - opex },
    warnings: [...(quote.takeoffs.some(row=>!row.lineId&&(row.quantity||row.hours))?['Some takeoff rows have no item. Assign an Item # or name to include them in the quote.']:[]), ...(estimatorResult?.warnings ?? []), ...lines.filter(line => line.overallocatedTradeHours > 0).map(line => `${line.name}: takeoff trade hours exceed allowed hours by ${line.overallocatedTradeHours}.`)] };
}
