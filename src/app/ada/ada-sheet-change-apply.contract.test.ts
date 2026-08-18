import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const adapter = join(root, "src/lib/ada-google-sheets.ts");
const route = join(root, "src/app/api/ada/workspaces/[workspaceId]/revisions/[revisionId]/sheet/changes/[changeId]/apply/route.ts");
test("Ada applies a reviewed draft exactly once through the Google Sheets adapter", () => {
  assert.ok(existsSync(route));
  const adapterSource = readFileSync(adapter, "utf8"); const source = readFileSync(route, "utf8");
  assert.match(adapterSource, /applyAdaGoogleSheetRangeChange/);
  assert.match(adapterSource, /values\.update/);
  assert.match(source, /status.*draft/);
  assert.match(source, /applyAdaGoogleSheetRangeChange/);
  assert.match(source, /status: "applied"/);
  assert.match(source, /requireAdaAccess/);
});
