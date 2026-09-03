import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const uploaderPath = join(root, "src/components/ada-file-upload.tsx");
const viewerPath = join(root, "src/components/ada-evidence-viewer.tsx");
const detailPath = join(root, "src/components/ada-workspace-detail.tsx");
const routePath = join(root, "src/app/api/ada/workspaces/[workspaceId]/assets/[assetId]/initial-quote/route.ts");

test("a newly uploaded client drawing is analyzed and becomes the first quote revision", () => {
  assert.ok(existsSync(routePath), "the drawing-to-initial-quote route should exist");
  const uploader = readFileSync(uploaderPath, "utf8");
  const viewer = readFileSync(viewerPath, "utf8");
  const detail = readFileSync(detailPath, "utf8");
  const route = readFileSync(routePath, "utf8");

  assert.match(uploader, /onUploaded\(completed\.asset\)/);
  assert.match(detail, /handleAssetUploaded/);
  assert.match(detail, /\/assets\/\$\{asset\.id\}\/analyze/);
  assert.match(detail, /\/assets\/\$\{asset\.id\}\/initial-quote/);
  assert.match(detail, /Analyzing client drawing…/);
  assert.match(detail, /Building initial quote…/);
  assert.match(detail, /setShowQuote\(true\)/);
  assert.match(viewer, /onAssetUploaded/);
  assert.match(viewer, /Ada used working assumptions/i);
  assert.doesNotMatch(viewer, /before she can rely on this evidence/i);

  assert.match(route, /requireAdaWorkspaceAccess\(workspaceId, "edit_draft"\)/);
  assert.match(route, /analysis_status.*ready/s);
  assert.match(route, /ada_quote_revisions/);
  assert.match(route, /existingRevision/);
  assert.match(route, /generateAdaQuote/);
  assert.match(route, /createAdaQuoteRevision/);
  assert.match(route, /ada_quote_messages/);
  assert.match(route, /asset:\$\{assetId\}/);
  assert.match(route, /drawing_initial_quote_created/);
});

test("adding a drawing after a quote exists analyzes it without silently replacing the quote", () => {
  assert.ok(existsSync(routePath), "the drawing-to-initial-quote route should exist");
  const route = readFileSync(routePath, "utf8");
  assert.match(route, /created: false/);
  assert.match(route, /revision: existingRevision/);
});
