export type QuoteAllocationTotals = {
  labor_hours: number;
  labor_budget: number;
  material_budget: number;
  non_lm_budget: number;
};

type OverviewSummaryInput = {
  allocation: QuoteAllocationTotals;
  labor_actual_hours: number;
  labor_actual_cost: number;
  material_actual: number;
  non_lm_actual: number;
};

type OverviewMetric = {
  actual: number;
  budget: number;
  percent: number;
};

function metric(actual: number, budget: number): OverviewMetric {
  return {
    actual,
    budget,
    percent: budget > 0 ? (actual / budget) * 100 : 0,
  };
}

export function buildProjectOverviewSummary(input: OverviewSummaryInput) {
  const nonLaborActual = input.material_actual + input.non_lm_actual;
  const nonLaborBudget = input.allocation.material_budget + input.allocation.non_lm_budget;
  const totalActualCost = input.labor_actual_cost + nonLaborActual;
  const totalBudgetCost = input.allocation.labor_budget + nonLaborBudget;

  return {
    labor: metric(input.labor_actual_hours, input.allocation.labor_hours),
    non_labor: metric(nonLaborActual, nonLaborBudget),
    total_cost: metric(totalActualCost, totalBudgetCost),
  };
}
