import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const detail = join(root, "src/components/ada-workspace-detail.tsx");
const evidence = join(root, "src/components/ada-evidence-viewer.tsx");
const upload = join(root, "src/components/ada-file-upload.tsx");
const assetRoute = join(root, "src/app/api/ada/workspaces/[workspaceId]/assets/[assetId]/route.ts");

test("Ada follows Codex composition: attachment from composer and a controlled file split", () => {
  for (const path of [detail, evidence, upload, assetRoute]) assert.ok(existsSync(path), `${path.replace(`${root}/`, "")} should exist`);

  const detailSource = readFileSync(detail, "utf8");
  const evidenceSource = readFileSync(evidence, "utf8");
  const uploadSource = readFileSync(upload, "utf8");
  const routeSource = readFileSync(assetRoute, "utf8");

  assert.match(detailSource, /AdaFileUpload/);
  assert.match(uploadSource, /aria-label="Attach file"/);
  assert.match(detailSource, /setShowEvidence\(true\)/);
  assert.match(detailSource, /Open files/);
  assert.match(evidenceSource, /Archive file/);
  assert.match(evidenceSource, /method: "DELETE"/);
  assert.match(uploadSource, /uploadToSignedUrl/);
  assert.match(uploadSource, /onUploaded/);
  assert.match(routeSource, /export async function DELETE/);
  assert.match(routeSource, /requireAdaWorkspaceAccess\(/);
  assert.match(routeSource, /archive_ada_quote_asset/);
  assert.doesNotMatch(routeSource, /storage\.from\(ASSET_BUCKET\)\.remove/);
});
