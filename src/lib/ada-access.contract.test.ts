import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const accessPath = join(root, "src/lib/ada-access.ts");
const serverPath = join(root, "src/lib/ada-server.ts");
const gatePath = join(root, "src/components/ada-access-gate.tsx");
const routePath = join(root, "src/app/api/ada/workspaces/route.ts");
const pagePath = join(root, "src/app/ada/page.tsx");
const sidebarPath = join(root, "src/components/Sidebar.tsx");

test("Ada has an explicit permission boundary on direct routes and API calls", () => {
  for (const path of [accessPath, serverPath, gatePath, routePath, pagePath]) {
    assert.ok(existsSync(path), `${path.replace(`${root}/`, "")} should exist`);
  }

  const accessSource = readFileSync(accessPath, "utf8");
  const serverSource = readFileSync(serverPath, "utf8");
  const gateSource = readFileSync(gatePath, "utf8");
  const routeSource = readFileSync(routePath, "utf8");
  const pageSource = readFileSync(pagePath, "utf8");
  const sidebarSource = readFileSync(sidebarPath, "utf8");

  assert.match(serverSource, /ada_access/);
  assert.match(serverSource, /requireAdaWorkspaceAccess/);
  assert.match(serverSource, /created_by_email/);
  assert.match(routeSource, /requireAdaIdentity\(/);
  assert.match(routeSource, /quote_workspace_members/);
  assert.match(routeSource, /create_quote_workspace/);
  assert.doesNotMatch(routeSource, /requireAdaAccess\(/);
  assert.match(gateSource, /AdaAccessGate/);
  assert.match(pageSource, /AdaAccessGate/);
  assert.match(sidebarSource, /Ada/);
});
