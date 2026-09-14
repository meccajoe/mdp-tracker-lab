import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260910143000_quote_workspace_restore.sql";

function source(relativePath: string) {
  const path = join(root, relativePath);
  assert.ok(existsSync(path), `${relativePath} should exist`);
  return readFileSync(path, "utf8");
}

test("workspace restore is an actor-bound audited inverse of archive", () => {
  const sql = source(migrationPath);
  const idempotency = sql.indexOf("WHERE idempotency_key = p_idempotency_key");
  const capability = sql.indexOf("capability_authorized :=");
  const lifecycleGuard = sql.indexOf("workspace_row.lifecycle_status <> 'archived'");

  assert.match(sql, /workspace_restored/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.restore_quote_workspace/i);
  assert.match(sql, /current_quote_actor_email\(\)/);
  assert.match(sql, /user_id = auth\.uid\(\)[\s\S]{0,140}email_normalized = normalized_actor/);
  assert.match(sql, /capability = 'archive_workspace'/);
  assert.match(sql, /event_type = 'workspace_archived'[\s\S]{0,180}prior_state/);
  assert.ok(capability >= 0 && capability < idempotency, "current capability must be checked before replay");
  assert.ok(idempotency >= 0 && lifecycleGuard > idempotency, "idempotent replay must resolve before mutable lifecycle checks");
  assert.match(sql, /WHEN restored_state = 'draft' THEN 'draft'/);
  assert.match(sql, /INSERT INTO public\.quote_workflow_events[\s\S]*'workspace_restored'/i);
  assert.match(sql, /archived_at = NULL/);
  assert.match(sql, /row_version = row_version \+ 1/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.restore_quote_workspace/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.restore_quote_workspace[\s\S]*TO authenticated/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.restore_quote_workspace[\s\S]*service_role/i);
});

test("workspace lifecycle routes preserve rename, repeatable archive, and restore semantics", () => {
  const detailRoute = source("src/app/api/ada/workspaces/[workspaceId]/route.ts");
  const restoreRoute = source("src/app/api/quote-workspaces/[workspaceId]/restore/route.ts");
  const server = source("src/lib/ada-server.ts");
  const permissions = source("src/lib/quote-permissions.ts");

  assert.match(detailRoute, /update_ada_quote_workspace_metadata/);
  assert.match(source(migrationPath), /CREATE OR REPLACE FUNCTION public\.rename_quote_workspace/i);
  assert.match(detailRoute, /body\.renameOnly[\s\S]{0,500}rename_quote_workspace/);
  assert.match(detailRoute, /Quote title is required/);
  assert.match(detailRoute, /select\("row_version, lifecycle_status, status"\)/);
  assert.match(detailRoute, /previous_status/);
  assert.match(detailRoute, /workspace-archive:\$\{workspaceId\}:v\$\{workspace\.row_version\}/);
  assert.match(restoreRoute, /requireQuoteProductWorkspaceAccess\(workspaceId, "restore_workspace"\)/);
  assert.match(restoreRoute, /actorSupabase[\s\S]{0,60}\.rpc\("restore_quote_workspace"/);
  assert.match(restoreRoute, /workspace-restore:\$\{workspaceId\}:v\$\{workspace\.row_version\}/);
  assert.match(restoreRoute, /code === "23505"[\s\S]{0,80}return 409/);
  assert.match(detailRoute, /error\.code === "PT409"[\s\S]{0,100}status: 409/);
  assert.match(server, /action !== "view_workspace" && action !== "restore_workspace"/);
  assert.match(permissions, /\| "restore_workspace"/);
  assert.match(permissions, /restore_workspace: "archive_workspace"/);
});

test("quote discovery hides archived work by default and exposes an explicit archived filter", () => {
  const collectionRoute = source("src/app/api/ada/workspaces/route.ts");
  assert.match(collectionRoute, /status === "archived"/);
  assert.match(collectionRoute, /query = query\.neq\("status", "archived"\)/);
});

test("quote library exposes responsive rename archive and restore controls", () => {
  const library = source("src/components/quote-library.tsx");
  for (const label of ["Rename", "Archive", "Restore", "Save name"]) assert.match(library, new RegExp(label));
  assert.match(library, /method:\s*"PATCH"/);
  assert.match(library, /renameOnly:\s*true/);
  assert.doesNotMatch(library, /body: JSON\.stringify\(\{ title, clientName: editingWorkspace/);
  assert.match(library, /method:\s*restoring \? "POST" : "DELETE"/);
  assert.match(library, /\/restore/);
  assert.match(library, /data-slot="quote-library-mobile-actions"/);
  assert.match(library, /data-slot="quote-library-table-actions"/);
  assert.doesNotMatch(library, /\.delete\(/);
});

test("standalone quote workspace supports route-backed workspace switching", () => {
  const workspace = source("src/components/quote-workspace.tsx");
  assert.match(workspace, /\/api\/quote-workspaces/);
  assert.match(workspace, /aria-label="Switch quote workspace"/);
  assert.match(workspace, /router\.push\(`\/quotes\/\$\{event\.target\.value\}`\)/);
  assert.match(workspace, /workspace\.id === workspaceId/);
});
