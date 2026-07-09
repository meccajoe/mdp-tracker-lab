import { QboProjectProfitabilityRow } from "@/lib/qbo-project-profitability";

export interface QboProjectWipMetrics {
  total_billed_to_date: number | null;
  total_cost_to_date: number | null;
  current_year_total_billings: number | null;
  current_year_total_retainage: number | null;
  current_year_costs: number | null;
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
