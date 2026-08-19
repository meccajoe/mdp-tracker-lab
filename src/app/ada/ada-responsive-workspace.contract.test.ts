import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const surface = readFileSync(join(root, "src/components/ada-workspace-surface.tsx"), "utf8");
const detail = readFileSync(join(root, "src/components/ada-workspace-detail.tsx"), "utf8");
test("Ada keeps phone chat focused while retaining a responsive library and split panes", () => {
  assert.match(surface, /fixed inset-y-0 left-0 z-40/);
  assert.match(surface, /md:relative/);
  assert.match(surface, /md:w-72/);
  assert.match(surface, /aria-label="Expand quote library"/);
  assert.match(detail, /max-md:hidden/);
  assert.match(detail, /min-w-0/);
  assert.match(detail, /sm:px-6/);
});
