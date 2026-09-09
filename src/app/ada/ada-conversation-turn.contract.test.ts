import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/app/api/ada/workspaces/[workspaceId]/messages/route.ts"), "utf8");

test("Ada message route completes and persists a grounded assistant turn", () => {
  assert.match(source, /streamAdaConversation/);
  assert.match(source, /type: "delta"/);
  assert.match(source, /actorSupabase\.rpc\("complete_ada_proposal_chat_turn"/);
  assert.match(source, /p_assistant_content: assistantContent/);
  assert.match(source, /p_assistant_payload_json: assistantPayload/);
  assert.match(source, /actorSupabase\.rpc\("fail_ada_chat_turn"/);
  assert.match(source, /retrieveAdaIntelligence/);
  assert.doesNotMatch(source, /from\("ada_quote_messages"\)\s*\.insert/);
  assert.doesNotMatch(source, /record_ada_compatibility_event/);
  assert.match(source, /analysis_json/);
  assert.match(source, /quote_json/);
});

test("Ada quote actions always carry a revision instruction", () => {
  const conversation = readFileSync(join(process.cwd(), "src/lib/ada-conversation.ts"), "utf8");
  assert.match(conversation, /required: \["citations", "needsInput", "quoteAction", "revisionInstruction", "limitations"\]/);
});
