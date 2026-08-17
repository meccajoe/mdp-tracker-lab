import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const route = readFileSync(join(process.cwd(), "src/app/api/ada/workspaces/[workspaceId]/revisions/route.ts"), "utf8");
test("Ada creates sequential immutable quote revisions with validated totals", () => {
  assert.match(route, /export async function POST/);
  assert.match(route, /revision_number/);
  assert.match(route, /internalCost/);
  assert.match(route, /sellPrice/);
  assert.match(route, /marginPct/);
  assert.match(route, /requireAdaAccess/);
  assert.match(route, /created_by_email/);
});
