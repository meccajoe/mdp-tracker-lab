import * as XLSX from "xlsx";
import { ProjectSummary, WipReportSnapshotRow } from "@/lib/types";
import { buildWipSummaryMetrics, WipFinancialActuals } from "@/lib/wip-report-formulas";

export type EstimatedCostSource = "derived" | "manual_override";
export type SnapshotStatus = "draft" | "final";
export type SalesTaxFilter = "any" | "has_value" | "missing";

export interface WipFilters {
  status: string;
  pm: string;
  customer: string;
  wipClass: string;
  contractDateFrom: string;
  contractDateTo: string;
  completionDateFrom: string;
  completionDateTo: string;
  salesTax: SalesTaxFilter;
  search: string;
}

export interface WipReportRow {
  project_id: string | null;
  customer: string;
  project_number: string | null;
  project_name: string;
  wip_class: string | null;
  contract_date: string | null;
  contract_amount: number | null;
  estimated_cost: number | null;
  updated_contract_amount: number | null;
  updated_est_cost: number | null;
  updated_est_gross_profit: number | null;
  est_gpm_pct: number | null;
  total_billed_to_date: number | null;
  total_cost_to_date: number | null;
  cost_pct_complete: number | null;
  revenue_earned: number | null;
  job_profit_earned: number | null;
  job_profit_pct_earned: number | null;
  billings_in_excess_of_costs: number | null;
  costs_in_excess_of_billings: number | null;
  current_year_total_billings: number | null;
  current_year_total_retainage: number | null;
  current_year_costs: number | null;
  estimated_cost_source: EstimatedCostSource;
  sales_tax_included: string | null;
  completion_date: string | null;
  project_status: string | null;
  pm_initials: string | null;
  source_updated_at: string | null;
}

export const EMPTY_WIP_FILTERS: WipFilters = {
  status: "All",
  pm: "All",
  customer: "All",
  wipClass: "All",
  contractDateFrom: "",
  contractDateTo: "",
  completionDateFrom: "",
  completionDateTo: "",
  salesTax: "any",
  search: "",
};

export function resolveEstimatedCost(project: Pick<ProjectSummary, "estimated_cost_override" | "total_budget">): {
  value: number | null;
  source: EstimatedCostSource;
} {
  if (project.estimated_cost_override != null) {
    return { value: project.estimated_cost_override, source: "manual_override" };
  }

  return {
    value: project.total_budget ?? null,
    source: "derived",
  };
}

export function buildLiveWipRow(project: ProjectSummary, financialActuals: Partial<WipFinancialActuals> | null = null): WipReportRow {
  const estimated = resolveEstimatedCost(project);
  const metrics = buildWipSummaryMetrics({
    updated_contract_amount: project.contract_amount,
    updated_est_cost: estimated.value,
    total_billed_to_date: financialActuals?.total_billed_to_date ?? null,
    total_cost_to_date: financialActuals?.total_cost_to_date ?? null,
    current_year_total_billings: financialActuals?.current_year_total_billings ?? null,
    current_year_total_retainage: financialActuals?.current_year_total_retainage ?? null,
    current_year_costs: financialActuals?.current_year_costs ?? null,
  });

  return {
    project_id: project.id,
    customer: project.client,
    project_number: project.job_number ?? project.id,
    project_name: project.name,
    wip_class: project.wip_class,
    contract_date: project.close_date,
    contract_amount: project.contract_amount,
    estimated_cost: estimated.value,
    updated_contract_amount: metrics.updated_contract_amount,
    updated_est_cost: metrics.updated_est_cost,
    updated_est_gross_profit: metrics.updated_est_gross_profit,
    est_gpm_pct: metrics.est_gpm_pct,
    total_billed_to_date: metrics.total_billed_to_date,
    total_cost_to_date: metrics.total_cost_to_date,
    cost_pct_complete: metrics.cost_pct_complete,
    revenue_earned: metrics.revenue_earned,
    job_profit_earned: metrics.job_profit_earned,
    job_profit_pct_earned: metrics.job_profit_pct_earned,
    billings_in_excess_of_costs: metrics.billings_in_excess_of_costs,
    costs_in_excess_of_billings: metrics.costs_in_excess_of_billings,
    current_year_total_billings: metrics.current_year_total_billings,
    current_year_total_retainage: metrics.current_year_total_retainage,
    current_year_costs: metrics.current_year_costs,
    estimated_cost_source: estimated.source,
    sales_tax_included: project.sales_tax_included,
    completion_date: project.due_date,
    project_status: project.status,
    pm_initials: project.pm,
    source_updated_at: project.updated_at,
  };
}

export function coerceSnapshotRow(row: WipReportSnapshotRow): WipReportRow {
  return {
    project_id: row.project_id,
    customer: row.customer,
    project_number: row.project_number,
    project_name: row.project_name,
    wip_class: row.wip_class,
    contract_date: row.contract_date,
    contract_amount: row.contract_amount,
    estimated_cost: row.estimated_cost,
    updated_contract_amount: row.updated_contract_amount,
    updated_est_cost: row.updated_est_cost,
    updated_est_gross_profit: row.updated_est_gross_profit,
    est_gpm_pct: row.est_gpm_pct,
    total_billed_to_date: row.total_billed_to_date,
    total_cost_to_date: row.total_cost_to_date,
    cost_pct_complete: row.cost_pct_complete,
    revenue_earned: row.revenue_earned,
    job_profit_earned: row.job_profit_earned,
    job_profit_pct_earned: row.job_profit_pct_earned,
    billings_in_excess_of_costs: row.billings_in_excess_of_costs,
    costs_in_excess_of_billings: row.costs_in_excess_of_billings,
    current_year_total_billings: row.current_year_total_billings,
    current_year_total_retainage: row.current_year_total_retainage,
    current_year_costs: row.current_year_costs,
    estimated_cost_source: row.estimated_cost_source,
    sales_tax_included: row.sales_tax_included,
    completion_date: row.completion_date,
    project_status: row.project_status,
    pm_initials: row.pm_initials,
    source_updated_at: row.source_updated_at,
  };
}

export function matchesWipFilters(row: WipReportRow, filters: WipFilters): boolean {
  if (filters.status !== "All" && (row.project_status ?? "") !== filters.status) return false;
  if (filters.pm !== "All" && (row.pm_initials ?? "") !== filters.pm) return false;
  if (filters.customer !== "All" && row.customer !== filters.customer) return false;
  if (filters.wipClass !== "All" && (row.wip_class ?? "") !== filters.wipClass) return false;

  if (!matchesDateRange(row.contract_date, filters.contractDateFrom, filters.contractDateTo)) return false;
  if (!matchesDateRange(row.completion_date, filters.completionDateFrom, filters.completionDateTo)) return false;

  const salesTaxValue = (row.sales_tax_included ?? "").trim();
  if (filters.salesTax === "has_value" && !salesTaxValue) return false;
  if (filters.salesTax === "missing" && salesTaxValue) return false;

  const query = filters.search.trim().toLowerCase();
  if (query) {
    const haystack = [
      row.customer,
      row.project_number ?? "",
      row.project_name,
    ].join(" ").toLowerCase();

    if (!haystack.includes(query)) return false;
  }

  return true;
}

function matchesDateRange(value: string | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

export function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function buildWipCsv(rows: WipReportRow[]): string {
  const headers = [
    "Customer",
    "Project",
    "Project Status",
    "Updated Contract Amount",
    "Updated Est Cost",
    "Updated Est Gross Profit",
    "Est GPM%",
    "Total Billed to Date",
    "Total Cost to Date",
    "Cost % Complete",
    "Revenue Earned",
    "Job Profit Earned",
    "Job Profit % Earned",
    "Billings in Excess of Costs",
    "Costs in Excess of Billings",
    "Current Year Total Billings",
    "Current Year Total Retainage",
    "Current Year Costs",
  ];

  const body = rows.map((row) => [
    csvValue(row.customer),
    csvValue(buildProjectLabel(row)),
    csvValue(row.project_status ?? ""),
    row.updated_contract_amount ?? "",
    row.updated_est_cost ?? "",
    row.updated_est_gross_profit ?? "",
    row.est_gpm_pct ?? "",
    row.total_billed_to_date ?? "",
    row.total_cost_to_date ?? "",
    row.cost_pct_complete ?? "",
    row.revenue_earned ?? "",
    row.job_profit_earned ?? "",
    row.job_profit_pct_earned ?? "",
    row.billings_in_excess_of_costs ?? "",
    row.costs_in_excess_of_billings ?? "",
    row.current_year_total_billings ?? "",
    row.current_year_total_retainage ?? "",
    row.current_year_costs ?? "",
  ]);

  return [headers.join(","), ...body.map((line) => line.join(","))].join("\n");
}

function csvValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildProjectLabel(row: Pick<WipReportRow, "project_number" | "project_name">): string {
  return row.project_number ? `${row.project_number} — ${row.project_name}` : row.project_name;
}

export function buildWipWorkbook(rows: WipReportRow[]): XLSX.WorkBook {
  const data = rows.map((row) => ({
    Customer: row.customer,
    Project: buildProjectLabel(row),
    "Project Status": row.project_status,
    "Updated Contract Amount": row.updated_contract_amount,
    "Updated Est Cost": row.updated_est_cost,
    "Updated Est Gross Profit": row.updated_est_gross_profit,
    "Est GPM%": row.est_gpm_pct,
    "Total Billed to Date": row.total_billed_to_date,
    "Total Cost to Date": row.total_cost_to_date,
    "Cost % Complete": row.cost_pct_complete,
    "Revenue Earned": row.revenue_earned,
    "Job Profit Earned": row.job_profit_earned,
    "Job Profit % Earned": row.job_profit_pct_earned,
    "Billings in Excess of Costs": row.billings_in_excess_of_costs,
    "Costs in Excess of Billings": row.costs_in_excess_of_billings,
    "Current Year Total Billings": row.current_year_total_billings,
    "Current Year Total Retainage": row.current_year_total_retainage,
    "Current Year Costs": row.current_year_costs,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "WIP Report");
  return workbook;
}

export function buildSnapshotRows(rows: WipReportRow[]) {
  return rows.map((row) => ({
    project_id: row.project_id,
    customer: row.customer,
    project_number: row.project_number,
    project_name: row.project_name,
    wip_class: row.wip_class,
    contract_date: row.contract_date,
    contract_amount: row.contract_amount,
    estimated_cost: row.estimated_cost,
    updated_contract_amount: row.updated_contract_amount,
    updated_est_cost: row.updated_est_cost,
    updated_est_gross_profit: row.updated_est_gross_profit,
    est_gpm_pct: row.est_gpm_pct,
    total_billed_to_date: row.total_billed_to_date,
    total_cost_to_date: row.total_cost_to_date,
    cost_pct_complete: row.cost_pct_complete,
    revenue_earned: row.revenue_earned,
    job_profit_earned: row.job_profit_earned,
    job_profit_pct_earned: row.job_profit_pct_earned,
    billings_in_excess_of_costs: row.billings_in_excess_of_costs,
    costs_in_excess_of_billings: row.costs_in_excess_of_billings,
    current_year_total_billings: row.current_year_total_billings,
    current_year_total_retainage: row.current_year_total_retainage,
    current_year_costs: row.current_year_costs,
    estimated_cost_source: row.estimated_cost_source,
    sales_tax_included: row.sales_tax_included,
    completion_date: row.completion_date,
    project_status: row.project_status,
    pm_initials: row.pm_initials,
    source_updated_at: row.source_updated_at,
  }));
}
