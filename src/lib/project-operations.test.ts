import test from "node:test";
import assert from "node:assert/strict";

import {
  applyProjectOperationsFilters,
  buildProjectOperationsBoardRows,
  filterProjectActivityEvents,
  type ProjectActivityEventRow,
  type ProjectOperationsStateRow,
  type ProjectOperationsTaskRow,
} from "./project-operations";
import type { ProjectSummary } from "./types";

const project = (overrides: Partial<ProjectSummary>): ProjectSummary => ({
  id: "26153",
  name: "Whatnot Shelves",
  client: "Whatnot",
  pm: "NG",
  job_number: null,
  close_date: null,
  due_date: "2026-07-31",
  contract_amount: 100000,
  wip_class: null,
  sales_tax_included: null,
  estimated_cost_override: null,
  status: "Active",
  notes: null,
  hubspot_deal_id: null,
  hubspot_deal_url: null,
  qbo_project_id: null,
  qbo_project_url: null,
  bill_budget_uuid: null,
  bill_budget_name: null,
  bill_budget_seeded_at: null,
  bill_budget_seed_source: null,
  bill_budget_last_sync_status: null,
  bill_budget_last_sync_error: null,
  bill_job_name_snapshot: null,
  bill_budget_total_snapshot: null,
  budget_hrs: null,
  budget_design: null,
  budget_pm: null,
  budget_shipping: null,
  budget_id_labor: null,
  budget_travel: null,
  budget_storage: null,
  budget_props: null,
  budget_equipment: null,
  budget_rental: null,
  budget_crating: null,
  budget_flooring: null,
  project_type: null,
  created_at: "2026-07-20T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z",
  budget_materials: null,
  quote_labor: null,
  quote_materials: null,
  budget_baselined_at: null,
  pct_labor: null,
  pct_materials: null,
  quote_design: null,
  quote_pm: null,
  quote_shipping: null,
  quote_id_labor: null,
  quote_travel: null,
  quote_storage: null,
  quote_props: null,
  quote_equipment: null,
  quote_rental: null,
  quote_crating: null,
  quote_flooring: null,
  pct_design: null,
  pct_pm: null,
  pct_shipping: null,
  pct_id_labor: null,
  pct_travel: null,
  pct_storage: null,
  pct_props: null,
  pct_equipment: null,
  pct_rental: null,
  pct_crating: null,
  pct_flooring: null,
  total_hrs_used: 0,
  total_spent: 0,
  pending_amount: 0,
  budget_labor_dollars: 0,
  pct_hrs_used: 0,
  total_budget: 0,
  pct_budget_used: 0,
  qbo_total_hours: 0,
  qbo_labor_cost: 0,
  qbo_last_synced: null,
  ...overrides,
});

const state = (overrides: Partial<ProjectOperationsStateRow>): ProjectOperationsStateRow => ({
  project_id: "26153",
  operational_status: "needs_follow_up",
  next_action: "Confirm install window",
  blocker_summary: null,
  pending_human_input: "Waiting on client sign-off",
  context_notes: null,
  target_date: "2026-07-24",
  updated_by: "joe@meccadesign.com",
  created_at: "2026-07-20T12:00:00.000Z",
  updated_at: "2026-07-20T12:00:00.000Z",
  ...overrides,
});

const task = (overrides: Partial<ProjectOperationsTaskRow>): ProjectOperationsTaskRow => ({
  id: "task-1",
  project_id: "26153",
  title: "Get client approval",
  status: "open",
  owner_label: "PM",
  due_date: "2026-07-23",
  needs_human_input: true,
  notes: null,
  sort_order: 0,
  created_by: "joe@meccadesign.com",
  updated_by: "joe@meccadesign.com",
  created_at: "2026-07-20T12:15:00.000Z",
  updated_at: "2026-07-20T12:15:00.000Z",
  ...overrides,
});

const event = (overrides: Partial<ProjectActivityEventRow>): ProjectActivityEventRow => ({
  id: "event-1",
  project_id: "26153",
  event_date: "2026-07-20",
  event_type: "follow_up",
  summary: "Client asked for revised install timing",
  details: null,
  created_by: "joe@meccadesign.com",
  created_at: "2026-07-20T13:00:00.000Z",
  ...overrides,
});

test("buildProjectOperationsBoardRows aggregates state, tasks, and activity", () => {
  const rows = buildProjectOperationsBoardRows({
    projects: [project({}), project({ id: "26154", name: "Second Project", pm: "AS" })],
    states: [state({}), state({ project_id: "26154", operational_status: "blocked", blocker_summary: "Vendor pricing missing" })],
    tasks: [
      task({}),
      task({ id: "task-2", status: "blocked", needs_human_input: false }),
      task({ id: "task-3", project_id: "26154", title: "Chase vendor quote", status: "blocked" }),
    ],
    events: [event({}), event({ id: "event-2", project_id: "26154", event_date: "2026-07-19" })],
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.project.id, "26154", "blocked projects should sort to the top");
  assert.equal(rows[0]?.blocked_task_count, 1);
  assert.equal(rows[1]?.open_task_count, 2);
  assert.equal(rows[1]?.needs_human_count, 1);
  assert.equal(rows[1]?.pending_human_input, "Waiting on client sign-off");
});

test("applyProjectOperationsFilters supports blocked/human/search filters", () => {
  const rows = buildProjectOperationsBoardRows({
    projects: [project({}), project({ id: "26154", name: "Second Project", pm: "AS" })],
    states: [state({}), state({ project_id: "26154", operational_status: "blocked", pending_human_input: null })],
    tasks: [task({}), task({ id: "task-2", project_id: "26154", title: "Blocked vendor task", status: "blocked", needs_human_input: false })],
    events: [event({}), event({ id: "event-2", project_id: "26154", summary: "Blocked waiting on vendor" })],
  });

  assert.equal(applyProjectOperationsFilters(rows, {
    search: "vendor",
    pm: "All",
    projectStatus: "All",
    operationalStatus: "All",
    humanOnly: false,
    blockedOnly: false,
  }).length, 1);

  assert.equal(applyProjectOperationsFilters(rows, {
    search: "",
    pm: "All",
    projectStatus: "All",
    operationalStatus: "All",
    humanOnly: true,
    blockedOnly: false,
  }).length, 1);

  assert.equal(applyProjectOperationsFilters(rows, {
    search: "",
    pm: "All",
    projectStatus: "All",
    operationalStatus: "All",
    humanOnly: false,
    blockedOnly: true,
  }).length, 1);
});

test("filterProjectActivityEvents applies lookback windows in descending order", () => {
  const events = [
    event({ id: "event-1", event_date: "2026-07-20" }),
    event({ id: "event-2", event_date: "2026-07-17" }),
    event({ id: "event-3", event_date: "2026-07-10" }),
  ];

  const filtered = filterProjectActivityEvents(events, "2026-07-15", "2026-07-20");
  assert.deepEqual(filtered.map((item) => item.id), ["event-1", "event-2"]);
});
