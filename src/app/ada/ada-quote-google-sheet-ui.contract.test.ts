import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const canvas = readFileSync(join(root, "src/components/ada-quote-canvas.tsx"), "utf8");
const detail = readFileSync(join(root, "src/components/ada-workspace-detail.tsx"), "utf8");
test("Ada Quote Canvas creates a private Google working sheet for its selected revision", () => {
  assert.match(canvas, /Create working sheet/);
  assert.match(canvas, /onCreateWorkingSheet/);
  assert.match(detail, /createWorkingSheet/);
  assert.match(detail, /\/sheet/);
  assert.match(detail, /window\.open/);
});
