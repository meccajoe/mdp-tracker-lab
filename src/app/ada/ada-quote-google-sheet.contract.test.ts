import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const route = join(root, "src/app/api/ada/workspaces/[workspaceId]/revisions/[revisionId]/sheet/route.ts");
test("Ada creates a private Google working sheet from an owned quote revision", () => {
  assert.ok(existsSync(route));
  const source = readFileSync(route, "utf8");
  assert.match(source, /requireAdaAccess/);
  assert.match(source, /created_by_email/);
  assert.match(source, /createPrivateAdaGoogleSheet/);
  assert.match(source, /revisionId/);
});
