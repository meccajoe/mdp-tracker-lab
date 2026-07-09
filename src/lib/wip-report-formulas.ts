export interface WipFinancialActuals {
  updated_contract_amount: number | null;
  updated_est_cost: number | null;
  total_billed_to_date: number | null;
  total_cost_to_date: number | null;
  current_year_total_billings: number | null;
  current_year_total_retainage: number | null;
  current_year_costs: number | null;
}

export interface WipSummaryMetrics extends WipFinancialActuals {
  updated_est_gross_profit: number | null;
  est_gpm_pct: number | null;
  cost_pct_complete: number | null;
  revenue_earned: number | null;
  job_profit_earned: number | null;
  job_profit_pct_earned: number | null;
  billings_in_excess_of_costs: number | null;
  costs_in_excess_of_billings: number | null;
}

function isRealNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function divideOrZero(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function buildWipSummaryMetrics(actuals: WipFinancialActuals): WipSummaryMetrics {
  const hasUpdatedContractAmount = isRealNumber(actuals.updated_contract_amount);
  const hasUpdatedEstCost = isRealNumber(actuals.updated_est_cost);
  const hasTotalBilledToDate = isRealNumber(actuals.total_billed_to_date);
  const hasTotalCostToDate = isRealNumber(actuals.total_cost_to_date);

  const updatedContractAmount = hasUpdatedContractAmount ? actuals.updated_contract_amount : null;
  const updatedEstCost = hasUpdatedEstCost ? actuals.updated_est_cost : null;
  const totalBilledToDate = hasTotalBilledToDate ? actuals.total_billed_to_date : null;
  const totalCostToDate = hasTotalCostToDate ? actuals.total_cost_to_date : null;

  const updatedEstGrossProfit = updatedContractAmount != null && updatedEstCost != null
    ? updatedContractAmount - updatedEstCost
    : null;
  const estGpmPct = updatedEstGrossProfit != null && updatedContractAmount != null
    ? divideOrZero(updatedEstGrossProfit, updatedContractAmount)
    : null;
  const costPctComplete = totalCostToDate != null && updatedEstCost != null
    ? divideOrZero(totalCostToDate, updatedEstCost)
    : null;
  const revenueEarned = costPctComplete != null && updatedContractAmount != null
    ? (costPctComplete > 1
        ? updatedContractAmount
        : costPctComplete * updatedContractAmount)
    : null;
  const jobProfitEarned = revenueEarned != null && totalCostToDate != null
    ? revenueEarned - totalCostToDate
    : null;
  const jobProfitPctEarned = jobProfitEarned != null && revenueEarned != null
    ? (jobProfitEarned > 0 && revenueEarned > 0 ? divideOrZero(jobProfitEarned, revenueEarned) : 0)
    : null;
  const billingsInExcessOfCosts = revenueEarned != null && totalBilledToDate != null
    ? Math.max(totalBilledToDate - revenueEarned, 0)
    : null;
  const costsInExcessOfBillings = revenueEarned != null && totalBilledToDate != null
    ? Math.max(revenueEarned - totalBilledToDate, 0)
    : null;

  return {
    updated_contract_amount: actuals.updated_contract_amount,
    updated_est_cost: actuals.updated_est_cost,
    updated_est_gross_profit: updatedEstGrossProfit != null ? roundMoney(updatedEstGrossProfit) : null,
    est_gpm_pct: estGpmPct != null ? roundRatio(estGpmPct) : null,
    total_billed_to_date: actuals.total_billed_to_date,
    total_cost_to_date: actuals.total_cost_to_date,
    cost_pct_complete: costPctComplete != null ? roundRatio(costPctComplete) : null,
    revenue_earned: revenueEarned != null ? roundMoney(revenueEarned) : null,
    job_profit_earned: jobProfitEarned != null ? roundMoney(jobProfitEarned) : null,
    job_profit_pct_earned: jobProfitPctEarned != null ? roundRatio(jobProfitPctEarned) : null,
    billings_in_excess_of_costs: billingsInExcessOfCosts != null ? roundMoney(billingsInExcessOfCosts) : null,
    costs_in_excess_of_billings: costsInExcessOfBillings != null ? roundMoney(costsInExcessOfBillings) : null,
    current_year_total_billings: actuals.current_year_total_billings,
    current_year_total_retainage: actuals.current_year_total_retainage,
    current_year_costs: actuals.current_year_costs,
  };
}
