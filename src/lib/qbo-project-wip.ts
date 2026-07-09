import { QboProjectProfitabilityRow } from "@/lib/qbo-project-profitability";

export interface QboProjectWipMetrics {
  total_billed_to_date: number | null;
  total_cost_to_date: number | null;
  current_year_total_billings: number | null;
  current_year_total_retainage: number | null;
  current_year_costs: number | null;
}

export interface CachedQboProjectWipMetricRow extends QboProjectWipMetrics {
  project_id: string;
  as_of_date: string;
  billing_source: string;
  cost_source: string;
}

export function buildProjectProfitabilitySummaryUrl(input: {
  realmId: string;
  startDate: string;
  endDate: string;
}): string {
  const url = new URL(`https://quickbooks.api.intuit.com/v3/company/${input.realmId}/reports/ProjectProfitabilitySummary`);
  url.searchParams.set("minorversion", "70");
  url.searchParams.set("start_date", input.startDate);
  url.searchParams.set("end_date", input.endDate);
  return url.toString();
}

export function buildQboProjectWipMetrics(input: {
  allTimeRow: QboProjectProfitabilityRow | null;
  currentYearRow: QboProjectProfitabilityRow | null;
}): QboProjectWipMetrics {
  return {
    total_billed_to_date: input.allTimeRow?.income ?? null,
    total_cost_to_date: input.allTimeRow?.costs ?? null,
    current_year_total_billings: input.currentYearRow?.income ?? null,
    current_year_total_retainage: null,
    current_year_costs: input.currentYearRow?.costs ?? null,
  };
}

export function buildCachedQboProjectWipMetricRow(input: {
  projectId: string;
  asOfDate: string;
  metrics: QboProjectWipMetrics;
}): CachedQboProjectWipMetricRow {
  return {
    project_id: input.projectId,
    as_of_date: input.asOfDate,
    total_billed_to_date: input.metrics.total_billed_to_date,
    total_cost_to_date: input.metrics.total_cost_to_date,
    current_year_total_billings: input.metrics.current_year_total_billings,
    current_year_total_retainage: input.metrics.current_year_total_retainage,
    current_year_costs: input.metrics.current_year_costs,
    billing_source: "qbo_project_profitability_summary",
    cost_source: "qbo_project_profitability_summary",
  };
}

export function canServeHistoricalWipCache(input: {
  asOfDate: string;
  todayIso: string;
  cachedRowCount: number;
  projectCount: number;
}): boolean {
  return input.asOfDate < input.todayIso && input.projectCount > 0 && input.cachedRowCount === input.projectCount;
}
