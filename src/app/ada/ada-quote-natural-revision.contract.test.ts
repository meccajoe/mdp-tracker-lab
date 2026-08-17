import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const route = join(root, "src/app/api/ada/workspaces/[workspaceId]/revise/route.ts");
const canvas = join(root, "src/components/ada-quote-canvas.tsx");
test("Ada applies a natural-language quote correction as a new grounded revision", () => {
  assert.ok(existsSync(route));
  const source = readFileSync(route, "utf8");
  assert.match(source, /instruction/);
  assert.match(source, /ada_quote_revisions/);
  assert.match(source, /generateAdaQuote/);
  assert.match(source, /requireAdaAccess/);
  const canvasSource = readFileSync(canvas, "utf8");
  assert.match(canvasSource, /Ask Ada to revise/);
  assert.match(canvasSource, /onNaturalLanguageRevision/);
});
