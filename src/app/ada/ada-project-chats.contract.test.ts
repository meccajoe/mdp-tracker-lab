import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrations = join(root, "supabase/migrations");
const workspacesRoute = join(root, "src/app/api/ada/workspaces/route.ts");
const detailRoute = join(root, "src/app/api/ada/workspaces/[workspaceId]/route.ts");
const projectsRoute = join(root, "src/app/api/ada/projects/route.ts");
const shell = join(root, "src/components/ada-workspace-shell.tsx");
const surface = join(root, "src/components/ada-workspace-surface.tsx");
const detail = join(root, "src/components/ada-workspace-detail.tsx");

test("Ada projects group multiple chats while legacy concept mechanics stay internal", () => {
  const migrationName = readdirSync(migrations).find((name) => name.endsWith("_ada_quote_projects.sql"));
  assert.ok(migrationName, "Ada project/chat migration should exist");
  const migration = readFileSync(join(migrations, migrationName), "utf8");
  assert.match(migration, /create table if not exists public\.ada_quote_projects/i);
  assert.match(migration, /ada_project_id uuid references public\.ada_quote_projects/i);
  assert.match(migration, /idx_ada_quote_workspaces_project_recent/i);

  for (const path of [workspacesRoute, detailRoute, projectsRoute, shell, surface, detail]) assert.ok(existsSync(path), `${path.replace(`${root}/`, "")} should exist`);
  const workspaceSource = readFileSync(workspacesRoute, "utf8");
  const detailSource = readFileSync(detailRoute, "utf8");
  const projectsSource = readFileSync(projectsRoute, "utf8");
  const surfaceSource = readFileSync(surface, "utf8");
  const chatSource = readFileSync(detail, "utf8");

  assert.match(projectsSource, /requireAdaAccess\(/);
  assert.match(projectsSource, /ada_quote_projects/);
  assert.match(workspaceSource, /adaProjectId/);
  assert.match(workspaceSource, /ada_project_id/);
  assert.match(detailSource, /export async function PATCH/);
  assert.match(detailSource, /export async function DELETE/);
  assert.match(detailSource, /requireAdaWorkspaceAccess\(/);
  assert.match(detailSource, /actorSupabase\.rpc\("append_quote_workflow_event"/);
  assert.match(detailSource, /p_event_type: "workspace_archived"/);
  assert.doesNotMatch(detailSource, /\.update\(\{\s*status:\s*"archived"/);
  assert.doesNotMatch(detailSource, /storage\.from\(ASSET_BUCKET\)\.remove/);
  assert.match(surfaceSource, /New project/);
  assert.match(surfaceSource, /New chat/);
  assert.match(surfaceSource, /project_id/);
  assert.doesNotMatch(chatSource, /Choose concept/);
  assert.doesNotMatch(chatSource, /New concept/);
  assert.match(chatSource, /placeholder="Let’s quote something\.\.\."/);
  assert.match(chatSource, /aria-label="Open files"/);
  assert.doesNotMatch(chatSource, /Choose concept/);
});
