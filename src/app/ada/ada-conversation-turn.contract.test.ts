import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/app/api/ada/workspaces/[workspaceId]/messages/route.ts"), "utf8");

test("Ada message route completes and persists a grounded assistant turn", () => {
  assert.match(source, /streamAdaConversation/);
  assert.match(source, /type: "delta"/);
  assert.match(source, /role: "assistant"/);
  assert.match(source, /structured_payload_json/);
  assert.match(source, /retrieveAdaIntelligence/);
  assert.match(source, /chat_turn_completed/);
  assert.match(source, /chat_turn_failed/);
  assert.match(source, /analysis_json/);
  assert.match(source, /quote_json/);
});
