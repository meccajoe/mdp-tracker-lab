import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const generation = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/generate/route.ts"), "utf8");
const detail = readFileSync(join(root, "src/components/ada-workspace-detail.tsx"), "utf8");
const viewer = readFileSync(join(root, "src/components/ada-evidence-viewer.tsx"), "utf8");
const canvas = readFileSync(join(root, "src/components/ada-quote-canvas.tsx"), "utf8");
test("Ada quote evidence references can open their exact uploaded asset", () => {
  assert.match(generation, /select\("id, original_name/);
  assert.match(detail, /openQuoteEvidence/);
  assert.match(detail, /setShowEvidence\(true\)/);
  assert.match(viewer, /initialAssetId/);
  assert.match(viewer, /setSelectedId\(initialAssetId\)/);
  assert.match(canvas, /onOpenEvidenceRef/);
  assert.match(canvas, /evidenceRefs/);
});
