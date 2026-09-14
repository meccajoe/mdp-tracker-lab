import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(relativePath: string) {
  const path = join(root, relativePath);
  assert.ok(existsSync(path), `${relativePath} should exist`);
  return readFileSync(path, "utf8");
}

test("Release 3 exposes first-class quote routes and keeps Ada URLs as redirects", () => {
  const libraryPage = source("src/app/quotes/page.tsx");
  const workspacePage = source("src/app/quotes/[workspaceId]/page.tsx");
  const legacyLibraryPage = source("src/app/ada/page.tsx");
  const legacyWorkspacePage = source("src/app/ada/[workspaceId]/page.tsx");

  assert.match(libraryPage, /QuoteAccessGate/);
  assert.match(libraryPage, /QuoteLibrary/);
  assert.match(workspacePage, /QuoteAccessGate/);
  assert.match(workspacePage, /QuoteWorkspace/);
  assert.match(legacyLibraryPage, /redirect\("\/quotes"\)/);
  assert.match(legacyWorkspacePage, /redirect\(`\/quotes\/\$\{workspaceId\}`\)/);
});

test("quote navigation and direct routes enforce the Joe-only product preview gate", () => {
  const accessRoute = source("src/app/api/quotes/access/route.ts");
  const accessGate = source("src/components/quote-access-gate.tsx");
  const sidebar = source("src/components/Sidebar.tsx");
  const server = source("src/lib/ada-server.ts");

  assert.match(accessRoute, /requireQuoteProductAccess\(/);
  assert.match(server, /isQuoteProductAllowedEmail/);
  assert.match(server, /requireQuoteProductWorkspaceAccess/);
  assert.doesNotMatch(accessRoute, /requireAdaAccess\(/);
  assert.match(accessGate, /\/api\/quotes\/access/);
  assert.match(accessGate, /Quote Workspace access required/);
  assert.match(sidebar, /hasQuoteAccess/);
  assert.match(sidebar, /\/api\/quotes\/access/);
  assert.match(sidebar, /href="\/quotes" label="Quotes"/);
  assert.doesNotMatch(sidebar, /href="\/ada" label="Ada"/);
});

test("the quote library is a responsive table-based surface backed by governed workspace APIs", () => {
  const library = source("src/components/quote-library.tsx");
  const collectionApi = source("src/app/api/quote-workspaces/route.ts");
  const workspaceApi = source("src/app/api/quote-workspaces/[workspaceId]/route.ts");

  assert.match(collectionApi, /GET/);
  assert.match(collectionApi, /POST/);
  assert.match(workspaceApi, /GET/);
  assert.match(workspaceApi, /PATCH/);
  assert.match(workspaceApi, /DELETE/);
  assert.match(library, /\/api\/quote-workspaces/);
  assert.match(library, /method:\s*"POST"/);
  assert.match(library, /router\.push\(`\/quotes\/\$\{result\.workspace\.id\}`\)/);
  assert.match(library, /New quote/);
  assert.match(library, /Search quotes/);
  assert.match(library, /No project required/);
  assert.match(library, /data-slot="quote-library-mobile"/);
  assert.match(library, /data-slot="quote-library-table"/);
  assert.doesNotMatch(library, /Concepts?/i);
});

test("the standalone quote workspace preserves the proven governed editor inside Tracker", () => {
  const workspace = source("src/components/quote-workspace.tsx");
  const appShell = source("src/components/AppShell.tsx");

  assert.match(workspace, /AdaWorkspaceDetail/);
  assert.match(workspace, /href="\/quotes"/);
  assert.match(workspace, /Back to quotes/);
  assert.match(workspace, /data-slot="quote-workspace"/);
  assert.match(appShell, /pathname\.startsWith\("\/quotes"\).*"Quotes"/);
  assert.doesNotMatch(appShell, /pathname\.startsWith\("\/quotes"\)[\s\S]{0,120}ada-workspace-shell/);
});
