import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = resolve("supabase/migrations/20260817100000_labor_allocation_je_reviews.sql");
test("creates immutable review-only labor allocation JE drafts", () => {
  assert.ok(existsSync(migration));
  const sql = readFileSync(migration, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.labor_allocation_je_reviews/);
  assert.match(sql, /source_snapshot jsonb NOT NULL/);
  assert.match(sql, /status text NOT NULL DEFAULT 'draft'/);
  assert.match(sql, /CHECK \(status IN \('draft', 'ready_for_review', 'approved_for_manual_entry', 'rejected', 'posted'\)\)/);
  assert.match(sql, /qbo_transaction_id text/);
});
