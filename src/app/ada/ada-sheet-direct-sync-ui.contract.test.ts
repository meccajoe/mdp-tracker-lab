import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const pane = readFileSync(join(root, "src/components/ada-sheet-pane.tsx"), "utf8");
const detail = readFileSync(join(root, "src/components/ada-workspace-detail.tsx"), "utf8");
test("Ada Sheet pane checks direct edits and displays conflicts for review", () => {
  assert.match(pane, /Check for sheet edits/);
  assert.match(pane, /Direct sheet changes need review/);
  assert.match(pane, /onCheckSync/);
  assert.match(detail, /checkSheetSync/);
  assert.match(detail, /\/sheet\/sync/);
});
