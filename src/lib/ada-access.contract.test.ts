import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const accessPath = join(root, "src/lib/ada-access.ts");
const serverPath = join(root, "src/lib/ada-server.ts");
const quoteGatePath = join(root, "src/components/quote-access-gate.tsx");
const routePath = join(root, "src/app/api/ada/workspaces/route.ts");
const quoteAccessRoutePath = join(root, "src/app/api/quotes/access/route.ts");
const pagePath = join(root, "src/app/ada/page.tsx");
const quotePagePath = join(root, "src/app/quotes/page.tsx");
const sidebarPath = join(root, "src/components/Sidebar.tsx");

test("Quote Workspaces have an explicit permission boundary while legacy Ada routes redirect", () => {
  for (const path of [accessPath, serverPath, quoteGatePath, routePath, quoteAccessRoutePath, pagePath, quotePagePath]) {
    assert.ok(existsSync(path), `${path.replace(`${root}/`, "")} should exist`);
  }

  const accessSource = readFileSync(accessPath, "utf8");
  const serverSource = readFileSync(serverPath, "utf8");
  const quoteGateSource = readFileSync(quoteGatePath, "utf8");
  const routeSource = readFileSync(routePath, "utf8");
  const quoteAccessRouteSource = readFileSync(quoteAccessRoutePath, "utf8");
  const pageSource = readFileSync(pagePath, "utf8");
  const quotePageSource = readFileSync(quotePagePath, "utf8");
  const sidebarSource = readFileSync(sidebarPath, "utf8");

  assert.match(serverSource, /ada_access/);
  assert.match(serverSource, /requireAdaWorkspaceAccess/);
  assert.match(serverSource, /created_by_email/);
  assert.match(routeSource, /requireAdaIdentity\(/);
  assert.match(routeSource, /quote_workspace_members/);
  assert.match(routeSource, /create_quote_workspace/);
  assert.doesNotMatch(routeSource, /requireAdaAccess\(/);
  assert.match(quoteAccessRouteSource, /requireQuoteProductAccess\(/);
  assert.doesNotMatch(quoteAccessRouteSource, /quote_workspace_members/);
  assert.match(quoteGateSource, /QuoteAccessGate/);
  assert.match(quotePageSource, /QuoteAccessGate/);
  assert.match(pageSource, /redirect\("\/quotes"\)/);
  assert.match(sidebarSource, /href="\/quotes" label="Quotes"/);
});
