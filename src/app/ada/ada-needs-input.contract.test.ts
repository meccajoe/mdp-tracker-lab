import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const detailRoute = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/route.ts"), "utf8");
const viewer = readFileSync(join(root, "src/components/ada-evidence-viewer.tsx"), "utf8");
test("Ada shows analysis questions as a needs-input review panel", () => {
  assert.match(detailRoute, /analysis_json/);
  assert.match(viewer, /Needs input/);
  assert.match(viewer, /analysis_json\?\.questions/);
  assert.match(viewer, /Ask in chat/);
});
