import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const surface = readFileSync(join(root, "src/components/ada-workspace-surface.tsx"), "utf8");
const shell = readFileSync(join(root, "src/components/ada-workspace-shell.tsx"), "utf8");
const detail = readFileSync(join(root, "src/components/ada-workspace-detail.tsx"), "utf8");
const route = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/route.ts"), "utf8");

test("Ada chat cards own edit, delete, and move-to-project actions", () => {
  assert.match(surface, /aria-label={`Chat actions for \$\{chat.title\}`}/);
  assert.match(surface, /Edit chat/);
  assert.match(surface, /Delete chat/);
  assert.match(surface, /Move to project/);
  assert.match(shell, /onEditChat/);
  assert.match(shell, /onDeleteChat/);
  assert.match(shell, /onMoveChat/);
  assert.match(route, /adaProjectId/);
  assert.match(route, /ada_project_id/);
});

test("Ada composer keeps sentence-case guidance left-aligned between attachment and send", () => {
  assert.match(detail, /placeholder="Let’s quote something\.\.\."/);
  assert.doesNotMatch(detail, /placeholder:text-center/);
  assert.match(detail, /AdaFileUpload/);
  assert.match(detail, /Send/);
});
