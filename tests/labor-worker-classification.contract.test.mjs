import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = resolve("supabase/migrations/20260814100000_labor_worker_classifications.sql");

test("worker classification foundation preserves a roster snapshot without rewriting historical labor", () => {
  assert.ok(existsSync(migration), "worker classification migration should exist");
  const sql = readFileSync(migration, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.labor_worker_classifications/);
  assert.match(sql, /classification text NOT NULL CHECK \(classification IN \('employee', 'contractor'\)\)/);
  assert.match(sql, /roster_snapshot_date date NOT NULL/);
  assert.match(sql, /UNIQUE \(normalized_name, roster_snapshot_date\)/);
});
