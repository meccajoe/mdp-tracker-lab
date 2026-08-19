import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const route = readFileSync(join(process.cwd(), "src/app/api/ada/workspaces/[workspaceId]/messages/route.ts"), "utf8");
const detail = readFileSync(join(process.cwd(), "src/components/ada-workspace-detail.tsx"), "utf8");

test("Ada turns an approved conversational quote action into a persisted revision", () => {
  assert.match(route, /createAdaRevisionFromInstruction/);
  assert.match(route, /quoteAction === "propose_revision"/);
  assert.match(route, /revisionDelta/);
  assert.match(route, /quote_revision_created_from_chat/);
  assert.match(route, /revision_id/);
  assert.match(route, /source_revision_id/);
});

test("Ada renders the completed revision and price delta in conversation", () => {
  assert.match(detail, /Quote updated/);
  assert.match(detail, /revisionDelta/);
  assert.match(detail, /sellPriceDelta/);
  assert.match(detail, /Open quote/);
});
