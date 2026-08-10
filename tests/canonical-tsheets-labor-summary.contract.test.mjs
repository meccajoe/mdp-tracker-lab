import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = resolve("supabase/migrations/20260806190000_canonical_tsheets_labor_summary.sql");

test("project summary aggregates only positive-rate TSheets labor entries", () => {
  assert.ok(existsSync(migration), "canonical labor summary migration should exist");
  const sql = readFileSync(migration, "utf8");
  assert.match(sql, /FROM qbo_labor_entries\s+WHERE qbo_entry_id LIKE 'ts_%'\s+AND hourly_rate > 0/is);
  assert.match(sql, /SUM\(\(reg_hours \+ ot_hours\) \* hourly_rate\) AS total_labor_cost/);
});
