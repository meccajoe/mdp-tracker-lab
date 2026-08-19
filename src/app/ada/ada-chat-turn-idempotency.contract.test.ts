import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrations = join(root, "supabase/migrations");
const migrationName = readdirSync(migrations).find((name) => name.endsWith("_ada_chat_turn_idempotency.sql"));
const routePath = join(root, "src/app/api/ada/workspaces/[workspaceId]/messages/route.ts");
const detailPath = join(root, "src/components/ada-workspace-detail.tsx");

test("Ada owns one durable chat turn per workspace request id", () => {
  assert.ok(migrationName);
  const sql = readFileSync(join(migrations, migrationName!), "utf8");
  assert.match(sql, /create table if not exists public\.ada_chat_turns/i);
  assert.match(sql, /client_request_id uuid not null/i);
  assert.match(sql, /unique \(workspace_id, actor_email, client_request_id\)/i);
  assert.match(sql, /status text not null default 'pending'/i);
  assert.match(sql, /response_json jsonb/i);
  assert.match(sql, /create or replace function public\.claim_ada_chat_turn/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /interval '15 minutes'/i);
});

test("message retries return completed work without regenerating or duplicating revisions", () => {
  assert.ok(existsSync(routePath));
  const route = readFileSync(routePath, "utf8");
  assert.match(route, /clientRequestId/);
  assert.match(route, /claim_ada_chat_turn/);
  assert.match(route, /turn_status === "completed"/);
  assert.match(route, /response_json/);
  assert.match(route, /turn_status === "pending"/);
  assert.match(route, /ada_chat_turns/);
  assert.match(route, /status: "completed"/);
  assert.match(route, /status: "failed"/);
});

test("the browser reuses the same request id when retrying a failed turn", () => {
  const detail = readFileSync(detailPath, "utf8");
  assert.match(detail, /useRef/);
  assert.match(detail, /crypto\.randomUUID\(\)/);
  assert.match(detail, /clientRequestId/);
  assert.match(detail, /retryRequestRef/);
  assert.match(detail, /retryRequestRef\.current = null/);
});
