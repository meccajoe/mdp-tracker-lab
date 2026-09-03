import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const route = readFileSync(join(process.cwd(), "src/app/api/ada/workspaces/[workspaceId]/revisions/route.ts"), "utf8");
test("Ada creates sequential immutable quote revisions with validated totals", () => {
  assert.match(route, /export async function POST/);
  assert.match(route, /validateAdaQuoteSnapshot/);
  assert.match(route, /createAdaQuoteRevision/);
  assert.doesNotMatch(route, /body\.internalCost/);
  assert.doesNotMatch(route, /body\.sellPrice/);
  assert.doesNotMatch(route, /body\.marginPct/);
  assert.match(route, /requireAdaWorkspaceAccess\(workspaceId, "edit_draft"\)/);
  assert.match(route, /actorEmail/);
});
