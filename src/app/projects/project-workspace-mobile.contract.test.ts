import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/app/projects/[id]/page.tsx"), "utf8");

test("project workspace navigation is touch-safe and its panels can shrink on mobile", () => {
  assert.match(source, /overflow-x-auto overflow-y-hidden border-b/);
  assert.match(source, /min-h-11/);
  assert.match(source, /TabsContent value="allocation" className="min-w-0 pt-5/);
  assert.match(source, /TabsContent value="overview" className="min-w-0 pt-5/);
});

test("quote allocation provides compact mobile rows instead of forcing the desktop table", () => {
  assert.match(source, /data-slot="project-quote-allocation-mobile"/);
  assert.match(source, /lg:hidden/);
  assert.match(source, /hidden lg:block/);
  assert.match(source, /line-clamp-2/);
});
