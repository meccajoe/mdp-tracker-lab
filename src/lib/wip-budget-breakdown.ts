import { LABOR_RATE_PER_HR, HARDCODED_DEFAULT_PCTS } from "@/lib/budget-formula";
import { ProjectSummary } from "@/lib/types";

export interface WipBudgetBreakdownRow {
  category: string;
  percent: number;
  basisAmount: number;
  budgetDollars: number;
  budgetHours: number | null;
}

type BreakdownConfig = {
  category: string;
  budgetKey: keyof ProjectSummary;
  pctKey: keyof ProjectSummary | null;
  pctDefaultKey: keyof typeof HARDCODED_DEFAULT_PCTS | null;
  basisKey: keyof ProjectSummary | null;
  isLaborHours?: boolean;
};

const BREAKDOWN_CONFIG: BreakdownConfig[] = [
  {
    category: "Labor Hours",
    budgetKey: "budget_hrs",
    pctKey: "pct_labor",
    pctDefaultKey: "labor",
    basisKey: "quote_materials",
    isLaborHours: true,
  },
  {
    category: "Materials",
    budgetKey: "budget_materials",
    pctKey: "pct_materials",
    pctDefaultKey: "materials",
    basisKey: "quote_materials",
  },
  {
    category: "Design",
    budgetKey: "budget_design",
    pctKey: "pct_design",
    pctDefaultKey: "design",
    basisKey: "quote_design",
  },
  {
    category: "Project Management",
    budgetKey: "budget_pm",
    pctKey: "pct_pm",
    pctDefaultKey: "pm",
    basisKey: "quote_pm",
  },
  {
    category: "Shipping",
    budgetKey: "budget_shipping",
    pctKey: "pct_shipping",
    pctDefaultKey: "shipping",
    basisKey: "quote_shipping",
  },
  {
    category: "Crating",
    budgetKey: "budget_crating",
    pctKey: "pct_crating",
    pctDefaultKey: "crating",
    basisKey: "quote_crating",
  },
  {
    category: "I&D Labor",
    budgetKey: "budget_id_labor",
    pctKey: "pct_id_labor",
    pctDefaultKey: "id_labor",
    basisKey: "quote_id_labor",
  },
  {
    category: "Travel",
    budgetKey: "budget_travel",
    pctKey: "pct_travel",
    pctDefaultKey: "travel",
    basisKey: "quote_travel",
  },
  {
    category: "Props",
    budgetKey: "budget_props",
    pctKey: "pct_props",
    pctDefaultKey: "props",
    basisKey: "quote_props",
  },
  {
    category: "Equipment",
    budgetKey: "budget_equipment",
    pctKey: "pct_equipment",
    pctDefaultKey: "equipment",
    basisKey: "quote_equipment",
  },
  {
    category: "Rental",
    budgetKey: "budget_rental",
    pctKey: "pct_rental",
    pctDefaultKey: null,
    basisKey: "quote_rental",
  },
  {
    category: "Flooring/Graphics",
    budgetKey: "budget_flooring",
    pctKey: "pct_flooring",
    pctDefaultKey: "flooring",
    basisKey: "quote_flooring",
  },
];

export function buildWipBudgetBreakdownRows(project: ProjectSummary): WipBudgetBreakdownRow[] {
  return BREAKDOWN_CONFIG.map((config) => {
    const basisAmount = config.basisKey ? toNumber(project[config.basisKey]) : 0;
    const percent = resolvePercent(project, config.pctKey, config.pctDefaultKey);
    const storedBudget = toNumber(project[config.budgetKey]);
    const derivedBudgetDollars = config.isLaborHours
      ? Math.round(((basisAmount * percent) / 100))
      : Math.round(((basisAmount * percent) / 100));
    const budgetDollars = config.isLaborHours
      ? storedBudget > 0
        ? Math.round(storedBudget * LABOR_RATE_PER_HR)
        : derivedBudgetDollars
      : storedBudget > 0
        ? storedBudget
        : derivedBudgetDollars;
    const budgetHours = config.isLaborHours
      ? storedBudget > 0
        ? storedBudget
        : percent > 0 && basisAmount > 0
          ? Math.round((derivedBudgetDollars / LABOR_RATE_PER_HR) * 10) / 10
          : null
      : null;

    return {
      category: config.category,
      percent,
      basisAmount,
      budgetDollars,
      budgetHours,
    };
  });
}

function resolvePercent(
  project: ProjectSummary,
  pctKey: keyof ProjectSummary | null,
  pctDefaultKey: keyof typeof HARDCODED_DEFAULT_PCTS | null,
): number {
  if (pctKey) {
    const override = toNumber(project[pctKey]);
    if (override > 0) {
      return override;
    }
  }

  if (pctDefaultKey) {
    return HARDCODED_DEFAULT_PCTS[pctDefaultKey] ?? 0;
  }

  return 0;
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}
