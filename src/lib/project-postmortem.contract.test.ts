import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrations = join(root, "supabase/migrations");
const source = join(root, "src/lib/project-postmortem.ts");

test("post-mortem foundation persists source snapshots and Ada-gated lessons", () => {
  const migrationName = readdirSync(migrations).find((name) => name.includes("project_postmortems"));
  assert.ok(migrationName, "expected a project post-mortem migration");
  const sql = readFileSync(join(migrations, migrationName!), "utf8");
  assert.match(sql, /create table if not exists public\.project_postmortems/i);
  assert.match(sql, /source_snapshot jsonb not null/i);
  assert.match(sql, /status text not null/i);
  assert.match(sql, /create table if not exists public\.project_postmortem_lessons/i);
  assert.match(sql, /approved_for_ada boolean/i);
  assert.ok(existsSync(source), "expected project post-mortem source-packet builder");
});
