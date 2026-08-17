import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const drawer = join(root, "src/components/ada-intelligence-drawer.tsx");
const detail = join(root, "src/components/ada-workspace-detail.tsx");
test("Ada renders cited Tracker intelligence in an on-demand drawer", () => {
  assert.ok(existsSync(drawer));
  const drawerSource = readFileSync(drawer, "utf8");
  const detailSource = readFileSync(detail, "utf8");
  assert.match(drawerSource, /intelligence/);
  assert.match(drawerSource, /rationale/);
  assert.match(drawerSource, /limitations/);
  assert.match(detailSource, /AdaIntelligenceDrawer/);
  assert.match(detailSource, /Open intelligence/);
});
