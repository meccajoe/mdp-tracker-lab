import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const route = join(root, "src/app/api/ada/workspaces/[workspaceId]/revisions/[revisionId]/sheet/changes/propose/route.ts");
test("Ada turns safe sheet instructions into persisted draft changes", () => {
  assert.ok(existsSync(route));
  const source = readFileSync(route, "utf8");
  assert.match(source, /inferAdaSheetDraft/);
  assert.match(source, /instruction/);
  assert.match(source, /ada_quote_sheet_changes/);
  assert.match(source, /status: "draft"/);
  assert.match(source, /requireAdaWorkspaceAccess\(workspaceId, "edit_draft"\)/);
});
