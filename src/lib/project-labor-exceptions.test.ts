import assert from "node:assert/strict";
import test from "node:test";
import { buildLaborExceptionRows } from "./project-labor-exceptions.ts";

const entries = [
  { qbo_entry_id: "ts_1", employee_name: "A", date: "2026-08-02", reg_hours: 2, ot_hours: 0, hourly_rate: 30, rate_source: null, service_item: null },
  { qbo_entry_id: "ts_2", employee_name: "B", date: "2026-07-30", reg_hours: 3, ot_hours: 1, hourly_rate: 40, rate_source: "qbo_time_users", service_item: "PAINT LABOR" },
];

test("builds actionable rate, coding, and after-close exception rows", () => {
  assert.deepEqual(buildLaborExceptionRows(entries, "2026-08-01"), [
    { key: "unverified_rate", label: "Missing or unverified rate", entries: 1, hours: 2, action: "Resolve employee pay-rate provenance in QBO Time" },
    { key: "unassigned_coding", label: "Unassigned labor coding", entries: 1, hours: 2, action: "Assign a service item / trade in QBO Time" },
    { key: "after_close", label: "Labor dated after close", entries: 1, hours: 2, action: "Confirm late entry, continued work, or correct the close date" },
  ]);
});

test("returns no rows when labor has no review exceptions", () => {
  assert.deepEqual(buildLaborExceptionRows([entries[1]], "2026-08-01"), []);
});
