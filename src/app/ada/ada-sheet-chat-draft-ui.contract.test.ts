import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const pane = readFileSync(join(root, "src/components/ada-sheet-pane.tsx"), "utf8");
const detail = readFileSync(join(root, "src/components/ada-workspace-detail.tsx"), "utf8");
test("Ada Sheet pane can stage a constrained chat-style instruction for review", () => {
  assert.match(pane, /Ask Ada to stage a change/);
  assert.match(pane, /onProposeChange/);
  assert.match(detail, /proposeSheetChange/);
  assert.match(detail, /changes\/propose/);
});
