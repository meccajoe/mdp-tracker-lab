import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function findMigrationByFragment(fragment) {
  const migrationsDir = join(process.cwd(), "supabase/migrations");
  const filename = readdirSync(migrationsDir).find((entry) => entry.includes(fragment));
  assert.ok(filename, `expected a migration containing "${fragment}"`);
  return join(migrationsDir, filename);
}

test("materials catalog migration creates the catalog, alias, import staging, and audit tables", () => {
  const migrationPath = findMigrationByFragment("materials_catalog");
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /create table if not exists materials\b/i, "migration should create materials table");
  assert.match(sql, /create table if not exists material_vendor_prices\b/i, "migration should create material_vendor_prices table");
  assert.match(sql, /create table if not exists vendor_aliases\b/i, "migration should create vendor_aliases table");
  assert.match(sql, /create table if not exists material_aliases\b/i, "migration should create material_aliases table");
  assert.match(sql, /create table if not exists material_import_batches\b/i, "migration should create material_import_batches table");
  assert.match(sql, /create table if not exists material_import_rows\b/i, "migration should create material_import_rows table");
  assert.match(sql, /create table if not exists material_change_log\b/i, "migration should create material_change_log table");
  assert.match(sql, /references vendors\(id\)/i, "migration should link catalog records back to vendors");
  assert.match(sql, /to_tsvector\('english',\s*search_text\)/i, "migration should create a full-text search index on search_text");
  assert.match(sql, /check \(source_type in \('spreadsheet', 'invoice', 'bill', 'manual'\)\)/i, "migration should constrain source_type for vendor price provenance");
  assert.match(sql, /check \(status in \('preview', 'committed', 'failed'\)\)/i, "migration should constrain import batch status");
  assert.match(sql, /check \(status in \('parsed', 'needs_review', 'skipped', 'imported', 'error'\)\)/i, "migration should constrain import row status");
});
