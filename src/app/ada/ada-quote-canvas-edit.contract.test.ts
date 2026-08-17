import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const canvas = readFileSync(join(root, "src/components/ada-quote-canvas.tsx"), "utf8");
const detail = readFileSync(join(root, "src/components/ada-workspace-detail.tsx"), "utf8");
test("Ada canvas edits create a new revision and show the revision delta", () => {
  assert.match(canvas, /Edit quote/);
  assert.match(canvas, /Save revision/);
  assert.match(canvas, /Price change/);
  assert.match(canvas, /Margin change/);
  assert.match(canvas, /onSaveRevision/);
  assert.match(detail, /saveQuoteRevision/);
  assert.match(detail, /\/revisions/);
});
