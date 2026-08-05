import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/app/projects/[id]/page.tsx"), "utf8");

test("project pages use quote allocation as the default workspace view", () => {
  assert.match(source, /type ProjectWorkspaceView = "allocation" \| "overview" \| "budget" \| "activity" \| "issues"/);
  assert.match(source, /useState<ProjectWorkspaceView>\("allocation"\)/);
  assert.match(source, /TabsTrigger value="allocation">Quote Allocation<\/TabsTrigger>/);
  assert.ok(
    source.indexOf('TabsTrigger value="overview">Overview') < source.indexOf('TabsTrigger value="allocation">Quote Allocation'),
    "Overview should be first in the visible tab rail while Quote Allocation stays the default state"
  );
  assert.match(source, /TabsContent value="overview"/);
  assert.match(source, /TabsContent value="budget"/);
  assert.match(source, /TabsContent value="activity"/);
  assert.match(source, /TabsContent value="issues"/);
});

test("project notes use a header modal instead of an inline page section", () => {
  assert.match(source, /aria-label="Open project notes"/);
  assert.match(source, /<DialogTitle>Project notes<\/DialogTitle>/);
  assert.doesNotMatch(source, /<summary[^>]*>\s*[\s\S]*?<span className="font-medium">Notes<\/span>/);
});
