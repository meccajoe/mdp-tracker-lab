import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationDirectory = join(root, "supabase/migrations");
const workspaceRoute = join(root, "src/app/api/ada/workspaces/route.ts");
const adaPage = join(root, "src/app/ada/page.tsx");
const adaWorkspacePage = join(root, "src/app/ada/[workspaceId]/page.tsx");
const quoteLibraryPage = join(root, "src/app/quotes/page.tsx");
const quoteWorkspacePage = join(root, "src/app/quotes/[workspaceId]/page.tsx");
const quoteLibrary = join(root, "src/components/quote-library.tsx");
const quoteWorkspace = join(root, "src/components/quote-workspace.tsx");
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

test("Tracker exposes first-class quote routes while preserving the authorized Ada backend", () => {
  for (const path of [workspaceRoute, adaPage, adaWorkspacePage, quoteLibraryPage, quoteWorkspacePage, quoteLibrary, quoteWorkspace]) {
    assert.ok(existsSync(path), `${path.replace(`${root}/`, "")} should exist`);
  }

  const routeSource = readFileSync(workspaceRoute, "utf8");
  const adaPageSource = readFileSync(adaPage, "utf8");
  const adaWorkspaceSource = readFileSync(adaWorkspacePage, "utf8");
  const quoteLibraryPageSource = readFileSync(quoteLibraryPage, "utf8");
  const quoteWorkspacePageSource = readFileSync(quoteWorkspacePage, "utf8");
  const quoteLibrarySource = readFileSync(quoteLibrary, "utf8");
  const quoteWorkspaceSource = readFileSync(quoteWorkspace, "utf8");
  const sidebarSource = readFileSync(sidebar, "utf8");

  assert.match(routeSource, /requireAdaIdentity\(/, "Ada create/list route should authenticate the actor before normalized authorization");
  assert.match(routeSource, /quote_workspace_members/, "Ada listings should use normalized workspace membership");
  assert.match(routeSource, /create_quote_workspace/, "Ada creation should use the capability-gated workspace RPC");
  assert.doesNotMatch(routeSource, /requireAdaAccess\(/, "normalized quote authorization must not depend on the legacy Ada flag");
  assert.match(routeSource, /from\("ada_quote_workspaces"\)/);
  assert.match(adaPageSource, /redirect\("\/quotes"\)/);
  assert.match(adaWorkspaceSource, /redirect\(`\/quotes\/\$\{workspaceId\}`\)/);
  assert.match(quoteLibraryPageSource, /QuoteLibrary/);
  assert.match(quoteWorkspacePageSource, /QuoteWorkspace/);
  assert.match(quoteLibrarySource, /New quote/);
  assert.match(quoteLibrarySource, /Search quotes/);
  assert.match(quoteLibrarySource, /Needs input/);
  assert.match(quoteWorkspaceSource, /AdaWorkspaceDetail/);
  assert.match(sidebarSource, /href="\/quotes"/);
});
