import assert from "node:assert/strict";
import test from "node:test";

import { buildWipCsv, buildWipWorkbook, type WipReportRow } from "./wip-report";

function makeRow(overrides: Partial<WipReportRow> = {}): WipReportRow {
  return {
    project_id: "26141",
    customer: "Agency 3-2",
    project_number: "26141",
    project_name: "Nike / Scheels Pop Up",
    wip_class: null,
    contract_date: null,
    contract_amount: 66095,
    estimated_cost: 30587,
    updated_contract_amount: 66095,
    updated_est_cost: 30587,
    updated_est_gross_profit: 35508,
    est_gpm_pct: 0.5372,
    total_billed_to_date: 39657,
    total_cost_to_date: 1224.04,
    cost_pct_complete: 0.04,
    revenue_earned: 2643.8,
    job_profit_earned: 1419.76,
    job_profit_pct_earned: 0.537,
    billings_in_excess_of_costs: 37013.2,
    costs_in_excess_of_billings: null,
    current_year_total_billings: 39657,
    current_year_total_retainage: null,
    current_year_costs: 1224.04,
    estimated_cost_source: "derived",
    sales_tax_included: null,
    completion_date: null,
    project_status: "Active",
    pm_initials: "NG",
    source_updated_at: null,
    ...overrides,
  };
}

test("buildWipCsv includes project status as its own column", () => {
  const csv = buildWipCsv([makeRow()]);
  const [header, body] = csv.split("\n");

  assert.match(header, /Customer,Project,Project Status,Updated Contract Amount/);
  assert.match(body, /"Agency 3-2","26141 — Nike \/ Scheels Pop Up","Active",66095/);
});

test("buildWipWorkbook includes project status column", () => {
  const workbook = buildWipWorkbook([makeRow({ project_status: "On Hold" })]);
  const sheet = workbook.Sheets["WIP Report"];

  assert.equal(sheet.C1?.v, "Project Status");
  assert.equal(sheet.C2?.v, "On Hold");
});
