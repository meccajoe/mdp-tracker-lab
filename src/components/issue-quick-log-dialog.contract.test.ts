import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const dialogPath = join(process.cwd(), "src/components/issue-quick-log-dialog.tsx");
const sidebarPath = join(process.cwd(), "src/components/Sidebar.tsx");

test("quick issue logging is available from the persistent navigation", () => {
  assert.ok(existsSync(dialogPath), "quick issue dialog should exist");
  const dialog = readFileSync(dialogPath, "utf8");
  const sidebar = readFileSync(sidebarPath, "utf8");

  assert.match(dialog, /Log issue/);
  assert.match(dialog, /Project/);
  assert.match(dialog, /Category/);
  assert.match(dialog, /\/api\/production-issues/);
  assert.match(dialog, /access_token/);
  assert.match(dialog, /Authorization/);
  assert.match(dialog, /ownerLabel/);
  assert.match(sidebar, /IssueQuickLogDialog/);
});
