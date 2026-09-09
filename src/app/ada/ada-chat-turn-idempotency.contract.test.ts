import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrations = join(root, "supabase/migrations");
const migrationName = readdirSync(migrations).find((name) => name.endsWith("_ada_chat_turn_idempotency.sql"));
const proposalMigrationName = readdirSync(migrations).find((name) => name.endsWith("_quote_proposals.sql"));
const routePath = join(root, "src/app/api/ada/workspaces/[workspaceId]/messages/route.ts");
const detailPath = join(root, "src/components/ada-workspace-detail.tsx");

test("Ada owns one durable chat turn per workspace request id", () => {
  assert.ok(migrationName);
  assert.ok(proposalMigrationName);
  const sql = readFileSync(join(migrations, migrationName!), "utf8");
  const proposalSql = readFileSync(join(migrations, proposalMigrationName!), "utf8");
  const durableSql = `${sql}\n${proposalSql}`;
  assert.match(sql, /create table if not exists public\.ada_chat_turns/i);
  assert.match(sql, /client_request_id uuid not null/i);
  assert.match(sql, /unique \(workspace_id, actor_email, client_request_id\)/i);
  assert.match(sql, /status text not null default 'pending'/i);
  assert.match(sql, /response_json jsonb/i);
  assert.match(sql, /create or replace function public\.claim_ada_chat_turn/i);
  assert.match(durableSql, /create or replace function public\.ensure_ada_proposal_chat_user_message/i);
  assert.match(durableSql, /create or replace function public\.complete_ada_proposal_chat_turn/i);
  assert.match(durableSql, /pg_advisory_xact_lock/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /interval '15 minutes'/i);
  assert.match(durableSql, /grant execute on function public\.ensure_ada_proposal_chat_user_message/i);
  assert.match(durableSql, /grant execute on function public\.complete_ada_proposal_chat_turn/i);
  assert.match(durableSql, /revoke all on function public\.ensure_ada_proposal_chat_user_message[^;]*service_role/i);
  assert.match(durableSql, /revoke all on function public\.complete_ada_proposal_chat_turn[^;]*service_role/i);
  assert.match(sql, /turn_status = 'completed'|status = 'completed'/i);
  assert.match(proposalSql, /quote_actor_has_workspace_capability\(p_workspace_id, actor, 'edit_draft'\)[\s\S]*?IF t\.status = 'completed'/i);
  assert.match(proposalSql, /m\.workspace_id IS DISTINCT FROM p_workspace_id/);
  assert.match(proposalSql, /m\.concept_id IS DISTINCT FROM p_concept_id/);
  assert.match(proposalSql, /m\.role IS DISTINCT FROM 'user'/);
  assert.match(proposalSql, /lower\(btrim\(m\.created_by_email\)\) IS DISTINCT FROM actor/);
  assert.match(proposalSql, /char_length\(p_request_content\) > 20000/);
  assert.match(proposalSql, /octet_length\(p_request_content\) > 80000/);
  assert.match(proposalSql, /char_length\(p_assistant_content\) > 100000/);
  assert.match(proposalSql, /octet_length\(p_assistant_content\) > 400000/);
  assert.match(proposalSql, /jsonb_typeof\(p_assistant_payload_json\) IS DISTINCT FROM 'object'/);
  assert.match(proposalSql, /jsonb_typeof\(p_proposal_delta_json\) IS DISTINCT FROM 'object'/);
  assert.match(proposalSql, /octet_length\(jsonb_build_object\('assistantPayload'/);
});

test("message retries return completed work without regenerating or duplicating revisions", () => {
  assert.ok(existsSync(routePath));
  const route = readFileSync(routePath, "utf8");
  assert.match(route, /clientRequestId/);
  assert.match(route, /claim_ada_chat_turn/);
  assert.match(route, /turn_status === "completed"/);
  assert.match(route, /response_json/);
  assert.match(route, /turn_status === "pending"/);
  assert.match(route, /ensure_ada_proposal_chat_user_message/);
  assert.match(route, /complete_ada_proposal_chat_turn/);
  assert.match(route, /actorSupabase\.rpc/);
  assert.doesNotMatch(route, /from\("ada_quote_messages"\)\s*\.insert/);
  assert.doesNotMatch(route, /from\("ada_chat_turns"\)\.update/);
  assert.doesNotMatch(route, /createQuoteProposal/);
  assert.doesNotMatch(route, /record_ada_compatibility_event/);
  assert.match(route, /Ada could not complete this chat turn\./);
  assert.match(route, /validateAdaUserRequest\(content\)/);
  assert.match(route, /validateAdaAssistantResponse\(assistantContent, assistantPayload, proposalDelta\)/);
  assert.match(route, /userBoundsError/);
});

test("the browser reuses the same request id when retrying a failed turn", () => {
  const detail = readFileSync(detailPath, "utf8");
  assert.match(detail, /useRef/);
  assert.match(detail, /crypto\.randomUUID\(\)/);
  assert.match(detail, /clientRequestId/);
  assert.match(detail, /retryRequestRef/);
  assert.match(detail, /retryRequestRef\.current = null/);
});
