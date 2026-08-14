import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationDirectory = join(root, "supabase/migrations");
const workspaceRoute = join(root, "src/app/api/ada/workspaces/route.ts");
const adaPage = join(root, "src/app/ada/page.tsx");
const workspacePage = join(root, "src/app/ada/[workspaceId]/page.tsx");
const workspaceShell = join(root, "src/components/ada-workspace-shell.tsx");
const workspaceSurface = join(root, "src/components/ada-workspace-surface.tsx");
const sidebar = join(root, "src/components/Sidebar.tsx");

function getAdaMigrationSource() {
  const filename = readdirSync(migrationDirectory).find((entry) => entry.endsWith("_ada_quote_workspaces.sql"));
  assert.ok(filename, "Ada foundation migration should exist");
  return readFileSync(join(migrationDirectory, filename), "utf8");
}

test("Ada foundation persists independent pre-project quote workspaces", () => {
  const migration = getAdaMigrationSource();

  assert.match(migration, /create table if not exists (?:public\.)?ada_quote_workspaces/i);
  assert.match(migration, /last_activity_at/i);
  assert.match(migration, /pinned_at/i);
  assert.match(migration, /archived_at/i);
  assert.doesNotMatch(migration, /project_id\s+text\s+not null/i, "a quote workspace must not require a downstream Tracker project");
});

test("Ada exposes a quote-library route, workspace route, and authorized create API", () => {
  for (const path of [workspaceRoute, adaPage, workspacePage, workspaceShell, workspaceSurface]) {
    assert.ok(existsSync(path), `${path.replace(`${root}/`, "")} should exist`);
  }

  const routeSource = readFileSync(workspaceRoute, "utf8");
  const workspaceSource = readFileSync(workspacePage, "utf8");
  const shellSource = readFileSync(workspaceShell, "utf8");
  const surfaceSource = readFileSync(workspaceSurface, "utf8");
  const sidebarSource = readFileSync(sidebar, "utf8");

  assert.match(routeSource, /requireAdaAccess\(/, "Ada create/list route should use the Joe-only server-side authorization guard");
  assert.match(routeSource, /from\("ada_quote_workspaces"\)/);
  assert.match(workspaceSource, /AdaWorkspaceShell/);
  assert.match(shellSource, /AdaWorkspaceSurface/);
  assert.match(surfaceSource, /Ada library/);
  assert.match(surfaceSource, /New chat/);
  assert.match(surfaceSource, /Recent/);
  assert.match(surfaceSource, /Needs input/);
  assert.match(sidebarSource, /href="\/ada"/);
});
