import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url).pathname;
const files = {
  list: `${root}app/api/quote-workspaces/[workspaceId]/proposals/route.ts`,
  accept: `${root}app/api/quote-workspaces/[workspaceId]/proposals/[proposalId]/accept/route.ts`,
  reject: `${root}app/api/quote-workspaces/[workspaceId]/proposals/[proposalId]/reject/route.ts`,
};

test("Release 2 proposal routes exist and use authenticated capabilities", () => {
  for (const path of Object.values(files)) assert.ok(existsSync(path), path);
  const list = readFileSync(files.list, "utf8");
  const accept = readFileSync(files.accept, "utf8");
  const reject = readFileSync(files.reject, "utf8");
  assert.match(list, /requireAdaWorkspaceAccess\(workspaceId\)/);
  assert.match(list, /requireAdaWorkspaceAccess\(workspaceId, "edit_draft"\)/);
  assert.match(accept, /requireAdaWorkspaceAccess\(workspaceId, "edit_draft"\)/);
  assert.match(reject, /requireAdaWorkspaceAccess\(workspaceId, "edit_draft"\)/);
  for (const source of [list, accept, reject]) {
    assert.match(source, /actorSupabase/);
    assert.match(source, /actorEmail/);
    assert.match(source, /quote-proposal-persistence/);
    assert.match(source, /expectedRowVersion/);
    assert.match(source, /IdempotencyKey/);
    assert.doesNotMatch(source, /createAdaQuoteRevision|create_ada_quote_revision|service.?role|\.insert\(|\.update\(|\.delete\(/i);
  }
  assert.match(list, /validate.*UUID|UUID.*validate|isUuid/);
  assert.match(list, /creationIdempotencyKey/);
  assert.match(list, /parseOptionalSourceRevisionId\(body\.sourceRevisionId\)/);
  assert.doesNotMatch(reject, /reason\.trim\(\)\.length\s*>\s*2000/);
  assert.match(reject, /parseRejectionReason\(body\.reason\)/);
  assert.match(reject, /parseRejectionReason/);
  assert.match(accept, /editedQuoteJson|edited.*assumptions|edited.*evidence/i);
  assert.match(accept, /complete|trio|all three/i);
  const persistence = readFileSync(`${root}lib/quote-proposal-persistence.ts`, "utf8");
  assert.match(persistence, /export function parseProposalRequestObject/);
  for (const source of [accept, reject]) {
    const parser = source.indexOf("parseProposalRequestObject(await request.json())");
    const firstPropertyAccess = source.indexOf("body.expectedRowVersion");
    assert.ok(parser >= 0 && parser < firstPropertyAccess, "request object guard must precede body property access");
    assert.match(source, /parseProposalRequestObject\(await request\.json\(\)\)/);
    assert.match(source, /catch \(error\) \{ return errorResponse\(error\); \}/);
  }
  assert.match(accept, /try \{[\s\S]*const normalizedReason = parseAcceptanceReason\(body\.reason\);[\s\S]*acceptQuoteProposal/);
  assert.doesNotMatch(accept, /reason: parseAcceptanceReason\(body\.reason\)/);
  assert.match(reject, /parseRejectionReason/);
});

test("edited proposal UI payload reaches all governed acceptance snapshot arguments", () => {
  const accept = readFileSync(files.accept, "utf8");
  const helper = readFileSync(`${root}lib/ada-proposal-review.ts`, "utf8");
  assert.match(helper, /quoteJson: editedSnapshot\.quoteJson/);
  assert.match(helper, /assumptions: editedSnapshot\.assumptions/);
  assert.match(helper, /evidence: editedSnapshot\.evidence/);
  assert.doesNotMatch(helper, /editedRevision: editedSnapshot/);
  assert.match(accept, /editedQuoteJson: body\.quoteJson/);
  assert.match(accept, /editedAssumptions: body\.assumptions/);
  assert.match(accept, /editedEvidence: body\.evidence/);
});

test("proposal listing derives review deltas from exact source revisions", () => {
  const persistence = readFileSync(`${root}lib/quote-proposal-persistence.ts`, "utf8");
  assert.match(persistence, /from\("ada_quote_revisions"\)/);
  assert.match(persistence, /attachProposalDeltas/);
  assert.match(persistence, /sourceRevisionId/);
  assert.match(persistence, /proposalDelta/);
});
