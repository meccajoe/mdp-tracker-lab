import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const route = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/revisions/[revisionId]/sheet/route.ts"), "utf8");
const canvas = readFileSync(join(root, "src/components/ada-quote-canvas.tsx"), "utf8");
const detail = readFileSync(join(root, "src/components/ada-workspace-detail.tsx"), "utf8");
test("Ada opens an existing revision-linked working sheet and shows its sync state", () => {
  assert.match(route, /export async function GET/);
  assert.match(route, /sync_status/);
  assert.match(canvas, /Working sheet/);
  assert.match(canvas, /Open sheet/);
  assert.match(canvas, /syncStatus/);
  assert.match(detail, /loadWorkingSheet/);
});
