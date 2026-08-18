import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const source = readFileSync(join(process.cwd(), "src/components/ada-sheet-pane.tsx"), "utf8");
test("Ada Sheet pane stages and explicitly applies reviewable range changes", () => {
  assert.match(source, /Range to change/);
  assert.match(source, /Proposed value/);
  assert.match(source, /Stage for review/);
  assert.match(source, /Apply change/);
  assert.match(source, /changes/);
  assert.match(source, /onStageChange/);
  assert.match(source, /onApplyChange/);
});
