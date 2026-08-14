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

test("Ada has a Joe-only access boundary on direct routes and API calls", () => {
  for (const path of [accessPath, serverPath, gatePath, routePath, pagePath]) {
    assert.ok(existsSync(path), `${path.replace(`${root}/`, "")} should exist`);
  }

  const accessSource = readFileSync(accessPath, "utf8");
  const serverSource = readFileSync(serverPath, "utf8");
  const gateSource = readFileSync(gatePath, "utf8");
  const routeSource = readFileSync(routePath, "utf8");
  const pageSource = readFileSync(pagePath, "utf8");
  const sidebarSource = readFileSync(sidebarPath, "utf8");

  assert.match(accessSource, /joe@meccadesign\.com/);
  assert.match(accessSource, /mecca\.joe@gmail\.com/);
  assert.match(accessSource, /isAdaAllowedEmail/);
  assert.match(serverSource, /isAdaAllowedEmail/);
  assert.match(serverSource, /Ada is visible to Joe only/);
  assert.match(routeSource, /requireAdaAccess\(/);
  assert.match(gateSource, /isAdaAllowedEmail/);
  assert.match(pageSource, /AdaAccessGate/);
  assert.match(sidebarSource, /isAdaAllowedEmail/);
});
