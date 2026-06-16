import * as XLSX from "xlsx";
import { ProjectSummary, WipReportSnapshotRow } from "@/lib/types";

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

export function buildLiveWipRow(project: ProjectSummary): WipReportRow {
  const estimated = resolveEstimatedCost(project);

  return {
    project_id: project.id,
    customer: project.client,
    project_number: project.job_number ?? project.id,
    project_name: project.name,
    wip_class: project.wip_class,
    contract_date: project.close_date,
    contract_amount: project.contract_amount,
    estimated_cost: estimated.value,
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
    "Project #",
    "Project Name",
    "Class",
    "Contract Date",
    "Contract Amount",
    "Estimated Cost",
    "Sales Tax Included",
    "Completion Date",
  ];

  const body = rows.map((row) => [
    csvValue(row.customer),
    csvValue(row.project_number ?? ""),
    csvValue(row.project_name),
    csvValue(row.wip_class ?? ""),
    csvValue(row.contract_date ?? ""),
    row.contract_amount ?? "",
    row.estimated_cost ?? "",
    csvValue(row.sales_tax_included ?? ""),
    csvValue(row.completion_date ?? ""),
  ]);

  return [headers.join(","), ...body.map((line) => line.join(","))].join("\n");
}

function csvValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildWipWorkbook(rows: WipReportRow[]): XLSX.WorkBook {
  const data = rows.map((row) => ({
    Customer: row.customer,
    "Project #": row.project_number ?? "",
    "Project Name": row.project_name,
    Class: row.wip_class ?? "",
    "Contract Date": row.contract_date ?? "",
    "Contract Amount": row.contract_amount,
    "Estimated Cost": row.estimated_cost,
    "Sales Tax Included": row.sales_tax_included ?? "",
    "Completion Date": row.completion_date ?? "",
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
    estimated_cost_source: row.estimated_cost_source,
    sales_tax_included: row.sales_tax_included,
    completion_date: row.completion_date,
    project_status: row.project_status,
    pm_initials: row.pm_initials,
    source_updated_at: row.source_updated_at,
  }));
}
