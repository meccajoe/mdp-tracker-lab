import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrations = join(root, "supabase/migrations");
const assetsRoute = join(root, "src/app/api/ada/workspaces/[workspaceId]/assets/route.ts");
const completeRoute = join(root, "src/app/api/ada/workspaces/[workspaceId]/assets/[assetId]/complete/route.ts");
const previewRoute = join(root, "src/app/api/ada/workspaces/[workspaceId]/assets/[assetId]/url/route.ts");
const viewer = join(root, "src/components/ada-evidence-viewer.tsx");
const detail = join(root, "src/components/ada-workspace-detail.tsx");
const uploader = join(root, "src/components/ada-file-upload.tsx");

function assetMigration() {
  const filename = readdirSync(migrations).find((entry) => entry.endsWith("_ada_quote_assets.sql"));
  assert.ok(filename, "Ada evidence migration should exist");
  return readFileSync(join(migrations, filename), "utf8");
}

test("Ada evidence assets are private, project-free records scoped to quote workspaces", () => {
  const migration = assetMigration();

  assert.match(migration, /insert into storage\.buckets/i);
  assert.match(migration, /ada-quote-assets/);
  assert.match(migration, /false\s*\)\s*on conflict/i, "the asset bucket must not be public");
  assert.match(migration, /create table if not exists public\.ada_quote_assets/i);
  assert.match(migration, /workspace_id uuid not null references public\.ada_quote_workspaces/i);
  assert.match(migration, /concept_id uuid references public\.ada_quote_concepts/i);
  assert.match(migration, /analysis_status text not null default 'uploaded'/i);
});

test("Ada evidence viewer uses Joe-only signed uploads and signed previews", () => {
  for (const path of [assetsRoute, completeRoute, previewRoute, viewer, uploader]) {
    assert.ok(existsSync(path), `${path.replace(`${root}/`, "")} should exist`);
  }

  const assetsSource = readFileSync(assetsRoute, "utf8");
  const completeSource = readFileSync(completeRoute, "utf8");
  const previewSource = readFileSync(previewRoute, "utf8");
  const viewerSource = readFileSync(viewer, "utf8");
  const detailSource = readFileSync(detail, "utf8");
  const uploaderSource = readFileSync(uploader, "utf8");

  assert.match(assetsSource, /requireAdaWorkspaceAccess\(/);
  assert.match(assetsSource, /createSignedUploadUrl/);
  assert.match(completeSource, /requireAdaWorkspaceAccess\(/);
  assert.match(previewSource, /createSignedUrl/);
  assert.match(uploaderSource, /uploadToSignedUrl/);
  assert.match(viewerSource, /PDF preview/);
  assert.match(viewerSource, /Evidence viewer/);
  assert.match(detailSource, /AdaEvidenceViewer/);
});
