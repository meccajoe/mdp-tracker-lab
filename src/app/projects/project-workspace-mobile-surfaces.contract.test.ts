import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/app/projects/[id]/page.tsx"), "utf8");

test("budget detail and expenses provide mobile cards instead of squeezed desktop tables", () => {
  assert.match(source, /data-slot="project-budget-mobile"/);
  assert.match(source, /data-slot="project-expenses-mobile"/);
  assert.match(source, /hidden lg:block/);
});

test("workspace rail permits horizontal gestures without a vertical scrollbar", () => {
  assert.match(source, /overflow-x-auto overflow-y-hidden/);
  assert.match(source, /\[scrollbar-width:none\]/);
});
