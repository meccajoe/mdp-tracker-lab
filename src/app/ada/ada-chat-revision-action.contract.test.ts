import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const route = readFileSync(join(process.cwd(), "src/app/api/ada/workspaces/[workspaceId]/messages/route.ts"), "utf8");

test("Ada turns propose_revision into a durable proposal without a canonical revision", () => {
  assert.match(route, /complete_ada_proposal_chat_turn/);
  assert.match(route, /generateAdaRevisionProposalFromInstruction/);
  assert.match(route, /p_expected_row_version/);
  assert.match(route, /current_revision_id/);
  assert.match(route, /ada-chat-turn:\$\{turnId\}/);
  assert.doesNotMatch(route, /createAdaRevisionFromInstruction/);
  assert.doesNotMatch(route, /createAdaQuoteRevision/);
  assert.doesNotMatch(route, /quote_revision_created_from_chat/);
  assert.doesNotMatch(route, /\.delete\(\)/);
  assert.doesNotMatch(route, /revision_id:\s*revisionAction/);
});

test("Ada exposes a pending proposal and proposal delta, not a quote update", () => {
  assert.match(route, /proposalDelta/);
  assert.match(route, /proposalSnapshot/);
  assert.match(route, /Proposal ready for review/);
  assert.doesNotMatch(route, /Quote updated/);
});
