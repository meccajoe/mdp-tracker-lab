import assert from "node:assert/strict";
import test from "node:test";
import { buildPostMortemDataGaps, buildPostMortemLaborEvidence } from "./project-postmortem.ts";

test("builds auditable employee-rate evidence from canonical QBO Time rows", () => {
  const evidence = buildPostMortemLaborEvidence([
    { qbo_entry_id: "ts_1", employee_name: "Worker A", service_item: "FAB LABOR", reg_hours: 4, ot_hours: 0, hourly_rate: 25, rate_source: "qbo_time_users", rate_verified_at: "2026-08-25T00:00:00Z" },
    { qbo_entry_id: "ts_2", employee_name: "Worker B", service_item: "FAB LABOR", reg_hours: 2, ot_hours: 0, hourly_rate: 30, rate_source: "qbo_time_users", rate_verified_at: "2026-08-25T00:00:00Z" },
    { qbo_entry_id: "qbo_3", employee_name: "Worker A", service_item: "FAB LABOR", reg_hours: 99, ot_hours: 0, hourly_rate: 0, rate_source: null, rate_verified_at: null },
  ]);
  assert.equal(evidence.rate_coverage.total_hours, 6);
  assert.equal(evidence.rate_coverage.verified_hours, 6);
  assert.equal(evidence.rate_coverage.complete, true);
  assert.equal(evidence.calculated_base_wage_cost, 160);
  assert.deepEqual(evidence.employee_rate_evidence.map((row) => [row.employee_name, row.hourly_rate]), [["Worker A", 25], ["Worker B", 30]]);
  assert.deepEqual(buildPostMortemDataGaps(evidence), []);
});

test("does not guess a missing rate", () => {
  const evidence = buildPostMortemLaborEvidence([
    { qbo_entry_id: "ts_1", employee_name: "Worker A", service_item: "SHOP LABOR", reg_hours: 3, ot_hours: 0, hourly_rate: null, rate_source: null, rate_verified_at: null },
  ]);
  assert.equal(evidence.rate_coverage.complete, false);
  assert.equal(evidence.rate_coverage.missing_rate_hours, 3);
  assert.match(buildPostMortemDataGaps(evidence).join(" "), /lack a verified QBO Time pay rate/i);
});

test("flags overtime until its premium rule is configured", () => {
  const evidence = buildPostMortemLaborEvidence([
    { qbo_entry_id: "ts_1", employee_name: "Worker A", service_item: "SHOP LABOR", reg_hours: 0, ot_hours: 2, hourly_rate: 25, rate_source: "qbo_time_users", rate_verified_at: "2026-08-25T00:00:00Z" },
  ]);
  assert.equal(evidence.overtime_hours, 2);
  assert.match(buildPostMortemDataGaps(evidence).join(" "), /overtime premium/i);
});
