import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const createRoute = readFileSync(join(root, "src/app/api/ada/workspaces/route.ts"), "utf8");
const detailRoute = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/route.ts"), "utf8");
const messagesRoute = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/messages/route.ts"), "utf8");
const detail = readFileSync(join(root, "src/components/ada-workspace-detail.tsx"), "utf8");
const upload = readFileSync(join(root, "src/components/ada-file-upload.tsx"), "utf8");
const viewer = readFileSync(join(root, "src/components/ada-evidence-viewer.tsx"), "utf8");
const assetsRoute = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/assets/route.ts"), "utf8");
const conceptsRoute = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/concepts/route.ts"), "utf8");
const governedMigration = readFileSync(join(root, "supabase/migrations/20260903103000_quote_normalized_backfill.sql"), "utf8");

test("Ada uses one workspace quote lineage without a visible Concept contract", () => {
  assert.match(createRoute, /rpc\("create_quote_workspace"/);
  assert.match(governedMigration, /INSERT INTO public\.ada_quote_concepts/i);
  assert.match(governedMigration, /'Workspace'[\s\S]*compatibility_concept_created/i);
  assert.doesNotMatch(createRoute, /Concept 1/);
  assert.doesNotMatch(detailRoute, /concepts:/);
  assert.doesNotMatch(detail, /concepts\[0\]/);
  assert.doesNotMatch(detail, /conceptId/);
  assert.doesNotMatch(detail, /message\.concept_id ===/);
});

test("Ada resolves its compatibility thread only on the server", () => {
  assert.match(messagesRoute, /resolveAdaCompatibilityThread/);
  assert.doesNotMatch(messagesRoute, /body\.conceptId/);
  assert.doesNotMatch(messagesRoute, /requestedConceptId/);
  assert.doesNotMatch(detail, /JSON\.stringify\(\{ conceptId/);
  assert.match(conceptsRoute, /Concepts are deferred/);
  assert.match(conceptsRoute, /status: 410/);
  assert.doesNotMatch(conceptsRoute, /\.insert\(/);
});

test("Ada files belong to the workspace rather than a visible Concept", () => {
  assert.doesNotMatch(upload, /conceptId/);
  assert.doesNotMatch(viewer, /conceptId/);
  assert.doesNotMatch(viewer, /asset\.concept_id ===/);
  assert.doesNotMatch(assetsRoute, /body\.conceptId/);
  assert.match(assetsRoute, /concept_id: null/);
});
