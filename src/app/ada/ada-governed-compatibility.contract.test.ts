import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const workflowMigration = readFileSync(join(root, "supabase/migrations/20260903102000_quote_workflow_events_and_outbox.sql"), "utf8");
const backfillMigration = readFileSync(join(root, "supabase/migrations/20260903103000_quote_normalized_backfill.sql"), "utf8");
const releaseOneGovernanceSql = `${workflowMigration}\n${backfillMigration}`;
const assetRoute = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/assets/[assetId]/route.ts"), "utf8");
const assetReadRoutes = [
  "src/app/api/ada/workspaces/[workspaceId]/route.ts",
  "src/app/api/ada/workspaces/[workspaceId]/assets/[assetId]/route.ts",
  "src/app/api/ada/workspaces/[workspaceId]/assets/[assetId]/url/route.ts",
  "src/app/api/ada/workspaces/[workspaceId]/assets/[assetId]/analyze/route.ts",
  "src/app/api/ada/workspaces/[workspaceId]/assets/[assetId]/complete/route.ts",
  "src/app/api/ada/workspaces/[workspaceId]/assets/[assetId]/initial-quote/route.ts",
  "src/app/api/ada/workspaces/[workspaceId]/messages/route.ts",
  "src/app/api/ada/workspaces/[workspaceId]/generate/route.ts",
].map((path) => ({ path, source: readFileSync(join(root, path), "utf8") }));
const evidenceViewerSource = readFileSync(join(root, "src/components/ada-evidence-viewer.tsx"), "utf8");
const adaServerSource = readFileSync(join(root, "src/lib/ada-server.ts"), "utf8");
const feedbackRouteSource = readFileSync(join(root, "src/app/api/ada/feedback/route.ts"), "utf8");

const completeRoute = assetReadRoutes.find(({ path }) => path.endsWith("/complete/route.ts"))!.source;
const initialQuoteRoute = assetReadRoutes.find(({ path }) => path.endsWith("/initial-quote/route.ts"))!.source;
const messagesRoute = assetReadRoutes.find(({ path }) => path.endsWith("/messages/route.ts"))!.source;
const workspaceRoute = assetReadRoutes.find(({ path }) => path.endsWith("[workspaceId]/route.ts"))!.source;

function migrationFunction(name: string, nextName: string) {
  const start = workflowMigration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = workflowMigration.indexOf(`CREATE OR REPLACE FUNCTION public.${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return workflowMigration.slice(start, end);
}

test("Ada evidence is archived through an authenticated service and retained in storage", () => {
  assert.match(workflowMigration, /ALTER TABLE public\.ada_quote_assets ADD COLUMN IF NOT EXISTS archived_at/i);
  assert.match(workflowMigration, /CREATE OR REPLACE FUNCTION public\.archive_ada_quote_asset/i);
  assert.match(workflowMigration, /CREATE TRIGGER prevent_ada_quote_asset_delete/i);
  assert.match(assetRoute, /actorSupabase\.rpc\("archive_ada_quote_asset"/);
  assert.doesNotMatch(assetRoute, /storage\.from\(ASSET_BUCKET\)\.remove/);
  assert.doesNotMatch(assetRoute, /\.from\("ada_quote_assets"\)\.delete\(/);
  assert.match(assetRoute, /archivedAssetId/);
  for (const { path, source } of assetReadRoutes) {
    assert.match(source, /\.is\("archived_at", null\)/, `${path} must exclude archived evidence from active reads`);
  }
  assert.match(evidenceViewerSource, /Archive file/);
  assert.doesNotMatch(evidenceViewerSource, /Delete file/);
});

test("Ada compatibility workspace projections are written only by authenticated database services", () => {
  assert.match(workflowMigration, /CREATE OR REPLACE FUNCTION public\.record_ada_compatibility_event/i);
  assert.match(workflowMigration, /CREATE OR REPLACE FUNCTION public\.update_ada_quote_workspace_metadata/i);
  for (const [path, source] of [
    ["complete route", completeRoute],
    ["initial quote route", initialQuoteRoute],
  ] as const) {
    assert.match(source, /actorSupabase\.rpc\("record_ada_compatibility_event"/, `${path} must use the compatibility event service`);
    assert.doesNotMatch(source, /from\("ada_quote_workspaces"\)[\s\S]{0,120}\.update\(\{[\s\S]{0,160}status:/, `${path} must not directly write workspace status`);
  }
  assert.match(messagesRoute, /actorSupabase\.rpc\("complete_ada_proposal_chat_turn"/);
  assert.doesNotMatch(messagesRoute, /record_ada_compatibility_event/);
  assert.doesNotMatch(messagesRoute, /from\("ada_quote_workspaces"\)[\s\S]{0,120}\.update\(\{[\s\S]{0,160}status:/);
  assert.doesNotMatch(initialQuoteRoute, /\.eq\("created_by_email", access\.actorEmail\)/);
  assert.doesNotMatch(messagesRoute, /\.eq\("created_by_email", access\.actorEmail\)/);
  assert.match(workspaceRoute, /actorSupabase[\s\S]{0,80}\.rpc\("update_ada_quote_workspace_metadata"/);
  assert.doesNotMatch(workspaceRoute, /from\("ada_quote_workspaces"\)[\s\S]{0,120}\.update\(/);
});

test("database mutation services enforce project ownership and terminal archive state", () => {
  const compatibilityEventFunction = migrationFunction("record_ada_compatibility_event", "update_ada_quote_workspace_metadata");
  const metadataFunction = migrationFunction("update_ada_quote_workspace_metadata", "protect_ada_quote_asset_history");
  const assetArchiveFunction = migrationFunction("archive_ada_quote_asset", "validate_quote_event_evidence");
  assert.ok(
    metadataFunction.includes("WHERE id = p_ada_project_id AND lower(btrim(created_by_email)) = normalized_actor"),
    "metadata RPC must verify the authenticated actor owns the selected Ada project",
  );
  assert.ok(
    compatibilityEventFunction.includes("IF workspace_lifecycle = 'archived' THEN"),
    "compatibility events must reject archived workspaces at the database boundary",
  );
  assert.ok(
    metadataFunction.includes("IF workspace_lifecycle = 'archived' THEN"),
    "metadata updates must reject archived workspaces at the database boundary",
  );
  assert.ok(
    assetArchiveFunction.includes("IF workspace_lifecycle = 'archived' THEN"),
    "evidence archival must reject archived workspaces at the database boundary",
  );
  assert.match(
    workflowMigration,
    /WHEN event_name IN \([^)]*evidence_attached[^)]*\) THEN prior = resulting AND prior <> 'archived'/i,
    "canonical no-op workflow events must not append after terminal archive",
  );
});

test("all workspace mutation routes fail closed after terminal archive", () => {
  assert.match(adaServerSource, /from\("ada_quote_workspaces"\)[\s\S]{0,180}select\("lifecycle_status"\)/);
  assert.match(adaServerSource, /action !== "view_workspace"[\s\S]{0,160}workspaceLifecycle === "archived"/);
  assert.match(feedbackRouteSource, /requireAdaWorkspaceAccess\(input\.workspaceId, "edit_draft"\)/);
  assert.match(messagesRoute, /actorSupabase\.rpc\("claim_ada_chat_turn"/);

  const chatClaimFunction = migrationFunction("claim_ada_chat_turn", "validate_quote_event_evidence");
  assert.match(chatClaimFunction, /current_quote_actor_email\(\)/);
  assert.match(chatClaimFunction, /quote_actor_has_workspace_capability\([\s\S]{0,160}'edit_draft'/);
  assert.match(chatClaimFunction, /workspace_row\.lifecycle_status = 'archived'/);
  assert.match(workflowMigration, /GRANT EXECUTE ON FUNCTION public\.claim_ada_chat_turn\([^)]*\) TO authenticated/i);
  assert.match(workflowMigration, /REVOKE ALL ON FUNCTION public\.claim_ada_chat_turn\([^)]*\) FROM PUBLIC, anon, authenticated, service_role/i);

  assert.match(releaseOneGovernanceSql, /CREATE OR REPLACE FUNCTION public\.protect_archived_quote_workspace_child\(\)/i);
  const terminalChildGuard = migrationFunction("protect_archived_quote_workspace_child", "claim_ada_chat_turn");
  assert.doesNotMatch(terminalChildGuard, /\b(?:OLD|NEW)\.workspace_id\b/);
  assert.match(terminalChildGuard, /to_jsonb\(OLD\)\s*->>\s*'workspace_id'/i);
  assert.match(terminalChildGuard, /to_jsonb\(NEW\)\s*->>\s*'workspace_id'/i);
  assert.match(terminalChildGuard, /FROM public\.ada_quote_revisions[\s\S]*revision_id/i);
  assert.match(
    releaseOneGovernanceSql,
    /CREATE TRIGGER protect_archived_quote_revision_work_package_labor[^;]+ON public\.quote_revision_work_package_labor/i,
  );
  for (const table of ["ada_quote_assets", "ada_quote_messages", "ada_quote_concepts", "ada_chat_turns"]) {
    assert.match(
      releaseOneGovernanceSql,
      new RegExp(`CREATE TRIGGER protect_archived_${table}[^;]+ON public\\.${table}`, "i"),
      `${table} must reject direct service-role mutation after workspace archive`,
    );
  }
});
