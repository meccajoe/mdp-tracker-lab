import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = resolve("supabase/migrations/20260806200000_labor_allocation_mapping_foundation.sql");
const syncRoute = resolve("src/app/api/tsheets/sync-labor/route.ts");

test("labor allocation foundation retains source service item and durable GL mappings", () => {
  assert.ok(existsSync(migration), "labor allocation mapping migration should exist");
  const sql = readFileSync(migration, "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS service_item text/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.labor_allocation_mappings/);
  assert.match(sql, /source_gl_account_id text NOT NULL/);
  assert.match(sql, /target_gl_account_id text NOT NULL/);
});

test("QBO Time sync stores the required Service Item alongside labor time", () => {
  const route = readFileSync(syncRoute, "utf8");
  assert.match(route, /SERVICE_ITEM_CUSTOMFIELD_ID/);
  assert.match(route, /service_item:/);
});
