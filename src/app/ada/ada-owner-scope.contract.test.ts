import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const project = readFileSync(join(root, "src/app/api/ada/projects/[projectId]/route.ts"), "utf8");
const workspaces = readFileSync(join(root, "src/app/api/ada/workspaces/route.ts"), "utf8");
const workspace = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/route.ts"), "utf8");
const changes = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/revisions/[revisionId]/sheet/changes/route.ts"), "utf8");
const apply = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/revisions/[revisionId]/sheet/changes/[changeId]/apply/route.ts"), "utf8");

test("Ada projects remain owner-scoped while quote workspaces are membership-scoped", () => {
  assert.ok((project.match(/created_by_email/g) ?? []).length >= 2);
  assert.match(project, /\.eq\("created_by_email", access\.actorEmail\)/);
  assert.match(workspaces, /from\("quote_workspace_members"\)/);
  assert.match(workspaces, /\.in\("id", workspaceIds\)/);
  assert.match(workspace, /requireAdaWorkspaceAccess/);
  assert.doesNotMatch(workspaces, /\.eq\("created_by_email", admin\.actorEmail\)/);
});

test("Ada Sheet change list, stage, and apply require owned workspace access", () => {
  assert.match(changes, /requireAdaWorkspaceAccess/);
  assert.match(apply, /requireAdaWorkspaceAccess/);
  assert.match(changes, /ada_quote_revisions/);
  assert.match(apply, /ada_quote_revisions/);
  assert.match(apply, /\.eq\("workspace_id", workspaceId\)/);
  assert.match(apply, /\.eq\("revision_id", revisionId\)/);
});
