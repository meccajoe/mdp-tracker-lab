import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const visionPath = join(root, "src/lib/ada-vision.ts");
const routePath = join(root, "src/app/api/ada/workspaces/[workspaceId]/assets/[assetId]/analyze/route.ts");
const envExamplePath = join(root, ".env.local.example");

test("Ada vision is server-only, policy-routed, and persists auditable output", () => {
  for (const path of [visionPath, routePath]) {
    assert.ok(existsSync(path), `${path.replace(`${root}/`, "")} should exist`);
  }

  const visionSource = readFileSync(visionPath, "utf8");
  const routeSource = readFileSync(routePath, "utf8");
  const envExample = readFileSync(envExamplePath, "utf8");

  assert.match(visionSource, /@anthropic-ai\/sdk/);
  assert.match(visionSource, /ADA_LLM_API_KEY/);
  assert.match(visionSource, /selectAdaModel/);
  assert.match(visionSource, /lowConfidence/);
  assert.match(routeSource, /requireAdaWorkspaceAccess\(/);
  assert.match(routeSource, /analysis_status: "analyzing"/);
  assert.match(routeSource, /analysis_json/);
  assert.match(routeSource, /analysis_status: "ready"/);
  assert.match(envExample, /ADA_LLM_API_KEY/);
  assert.match(envExample, /ADA_OPUS_MODEL/);
  assert.match(envExample, /ADA_VISION_MODEL/);
});
