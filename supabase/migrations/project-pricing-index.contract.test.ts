import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationPath = join(process.cwd(), "supabase/migrations/20260721190000_project_pricing_index.sql");

test("pricing intelligence index exposes HubSpot-backed project quote signals", () => {
  assert.ok(existsSync(migrationPath), "project pricing index migration should exist");
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /CREATE OR REPLACE VIEW public\.project_pricing_index/i);
  assert.match(sql, /FROM public\.project_summary p/i);
  assert.match(sql, /p\.hubspot_deal_id IS NOT NULL/i);
  assert.match(sql, /p\.quote_materials/i);
  assert.match(sql, /p\.project_type/i);
  assert.match(sql, /p\.contract_amount/i);
});
