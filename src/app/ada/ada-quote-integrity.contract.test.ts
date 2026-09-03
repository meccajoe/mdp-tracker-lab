import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrations = join(root, "supabase/migrations");
const migrationName = readdirSync(migrations).find((name) => name.endsWith("_ada_quote_integrity.sql"));
const revisionsRoute = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/revisions/route.ts"), "utf8");
const generateRoute = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/generate/route.ts"), "utf8");
const reviseRoute = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/revise/route.ts"), "utf8");
const acceptRoute = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/revisions/[revisionId]/accept/route.ts"), "utf8");
const messagesRoute = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/messages/route.ts"), "utf8");

test("Ada allocates revisions atomically and invalidates stale acceptance", () => {
  assert.ok(migrationName);
  const sql = readFileSync(join(migrations, migrationName!), "utf8");
  assert.match(sql, /accepted_revision_id uuid/i);
  assert.match(sql, /accepted_at timestamptz/i);
  assert.match(sql, /create or replace function public\.create_ada_quote_revision/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /max\(revision_number\)/i);
  assert.match(sql, /accepted_revision_id = null/i);
  assert.match(sql, /create or replace function public\.accept_ada_quote_revision/i);
  assert.match(sql, /latest/i);
  assert.match(sql, /quote_accepted/i);
});

test("every revision creation path uses canonical server validation and atomic persistence", () => {
  for (const source of [revisionsRoute, generateRoute, reviseRoute]) {
    assert.match(source, /createAdaQuoteRevision/);
  }
  assert.match(revisionsRoute, /validateAdaQuoteSnapshot/);
  assert.doesNotMatch(revisionsRoute, /body\.internalCost/);
  assert.doesNotMatch(revisionsRoute, /body\.sellPrice/);
  assert.doesNotMatch(revisionsRoute, /body\.marginPct/);
});

test("commercial approval is latest-only, canonical, and idempotent through one database operation", () => {
  assert.match(acceptRoute, /accept_ada_quote_revision/);
  assert.doesNotMatch(acceptRoute, /from\("ada_quote_events"\)\.insert/);
  assert.doesNotMatch(acceptRoute, /from\("ada_quote_workspaces"\)\.update/);
  assert.match(acceptRoute, /commercialApprovedRevisionId/);
  assert.doesNotMatch(acceptRoute, /acceptedRevisionId|status: "accepted"/);
  assert.match(messagesRoute, /workspaceResult\.data\.status === "accepted" \? "accepted"/);
});
