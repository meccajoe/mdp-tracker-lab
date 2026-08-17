import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const detail = readFileSync(join(root, "src/components/ada-workspace-detail.tsx"), "utf8");
const canvas = readFileSync(join(root, "src/components/ada-quote-canvas.tsx"), "utf8");
test("Ada chat can generate a quote and open the created revision in the canvas", () => {
  assert.match(detail, /generateQuote/);
  assert.match(detail, /\/generate/);
  assert.match(detail, /Generate quote/);
  assert.match(detail, /setShowQuote\(true\)/);
  assert.match(canvas, /Revision/);
});
