import assert from "node:assert/strict";
import test from "node:test";
import {
  QuoteProposalPersistenceError,
  acceptQuoteProposal,
  attachProposalDeltas,
  createQuoteProposal,
  listQuoteProposals,
  mapQuoteProposalRow,
  parseAcceptanceReason,
  parseProposalRequestObject,
  quoteProposalErrorStatus,
  rejectQuoteProposal,
  MAX_LINE_ITEMS,
  MAX_ASSUMPTIONS,
  MAX_EVIDENCE_ENTRIES,
  MAX_SNAPSHOT_JSON_BYTES,
  MAX_REASON_CHARS,
  parseRejectionReason,
  parseOptionalSourceRevisionId,
} from "./quote-proposal-persistence";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const proposalId = "22222222-2222-4222-8222-222222222222";
const revisionId = "33333333-3333-4333-8333-333333333333";
const quote = { lineItems: [{ itemName: "Fabric", buildItem: "Wall", lineType: "material", internalCost: 10, clientPrice: 20, confidence: "high", evidenceRefs: [] }] };
const row = { id: proposalId, workspace_id: workspaceId, source_revision_id: revisionId, expected_row_version: 4, status: "pending", proposed_revision_json: quote, proposed_assumptions_json: [" Confirm finish "], proposed_evidence_json: [{ sourceId: "sheet:1" }], proposed_manifest_hash: "hash", created_by_email: "joe@example.com", created_at: "2026-09-09T00:00:00Z", disposed_by_email: null, disposed_at: null, reason: null, edited_revision_json: null, edited_assumptions_json: null, edited_evidence_json: null, disposition_manifest_hash: null, accepted_revision_id: null, creation_idempotency_key: "create-1", disposition_idempotency_key: null };

test("normalizes omitted and null source revisions while validating supplied values", () => {
  assert.equal(parseOptionalSourceRevisionId(undefined), null);
  assert.equal(parseOptionalSourceRevisionId(null), null);
  assert.equal(parseOptionalSourceRevisionId(revisionId), revisionId);
  for (const value of ["not-a-uuid", 42, false, {}, []]) {
    assert.throws(() => parseOptionalSourceRevisionId(value), (error: unknown) => {
      return error instanceof QuoteProposalPersistenceError && (error as QuoteProposalPersistenceError).code === "22023";
    });
  }
});

test("parses optional acceptance reasons without coercing non-strings", () => {
  assert.equal(parseAcceptanceReason(undefined), null);
  assert.equal(parseAcceptanceReason(null), null);
  assert.equal(parseAcceptanceReason("   "), null);
  assert.equal(parseAcceptanceReason("  Approved  "), "Approved");
  for (const value of [42, false, {}, []]) {
    assert.throws(() => parseAcceptanceReason(value), (error: unknown) => {
      return error instanceof QuoteProposalPersistenceError && (error as QuoteProposalPersistenceError).code === "22023";
    });
  }
});

test("enforces shared snapshot and reason bounds", () => {
  assert.equal(MAX_LINE_ITEMS, 500);
  assert.equal(MAX_ASSUMPTIONS, 200);
  assert.equal(MAX_EVIDENCE_ENTRIES, 500);
  assert.equal(MAX_SNAPSHOT_JSON_BYTES, 1048576);
  assert.equal(MAX_REASON_CHARS, 2000);
  assert.equal(parseRejectionReason("  reject  "), "reject");
  const unicodeReasonAtLimit = "😀".repeat(MAX_REASON_CHARS);
  const unicodeReasonOverLimit = "😀".repeat(MAX_REASON_CHARS + 1);
  assert.equal(parseRejectionReason(unicodeReasonAtLimit), unicodeReasonAtLimit);
  assert.equal(parseAcceptanceReason(unicodeReasonAtLimit), unicodeReasonAtLimit);
  assert.throws(() => parseRejectionReason(unicodeReasonOverLimit), /bounded/i);
  assert.throws(() => parseAcceptanceReason(unicodeReasonOverLimit), /bounded/i);
  assert.throws(() => parseRejectionReason("x".repeat(MAX_REASON_CHARS + 1)), /bounded/i);
  assert.throws(() => parseAcceptanceReason("x".repeat(MAX_REASON_CHARS + 1)), /bounded/i);
});

test("rejects present non-string line assumptions before invoking the RPC", async () => {
  for (const assumption of [null, 42, false, {}, []]) {
    const supabase = fakeSupabase({ data: row, error: null });
    await assert.rejects(() => createQuoteProposal({
      supabase, workspaceId, actorEmail: "joe@example.com", expectedRowVersion: 3, sourceRevisionId: null,
      quoteJson: { lineItems: [{ ...quote.lineItems[0], assumption }] }, assumptions: [], evidence: [], creationIdempotencyKey: "create-1",
    }), (error: unknown) => error instanceof QuoteProposalPersistenceError && error.code === "22023");
    assert.equal(supabase.calls.length, 0);
  }
});

test("rejects each snapshot transport ceiling before invoking the RPC", async () => {
  const line = quote.lineItems[0];
  const cases = [
    { quoteJson: { lineItems: Array.from({ length: MAX_LINE_ITEMS + 1 }, () => line) }, assumptions: [], evidence: [] },
    { quoteJson: quote, assumptions: Array.from({ length: MAX_ASSUMPTIONS + 1 }, () => "a"), evidence: [] },
    { quoteJson: quote, assumptions: [], evidence: Array.from({ length: MAX_EVIDENCE_ENTRIES + 1 }, () => ({ value: "e" })) },
    { quoteJson: { lineItems: [{ ...line, itemName: "x".repeat(MAX_SNAPSHOT_JSON_BYTES) }] }, assumptions: [], evidence: [] },
  ];
  for (const input of cases) {
    const supabase = fakeSupabase({ data: row, error: null });
    await assert.rejects(() => createQuoteProposal({ supabase, workspaceId, actorEmail: "joe@example.com", expectedRowVersion: 3, sourceRevisionId: null, ...input, creationIdempotencyKey: "create-1" }), QuoteProposalPersistenceError);
    assert.equal(supabase.calls.length, 0);
  }
});

test("rejects null, arrays, and scalar proposal request JSON with code 22023", () => {
  assert.deepEqual(parseProposalRequestObject({ expectedRowVersion: 4 }), { expectedRowVersion: 4 });
  for (const value of [null, [], "request", 42, true]) {
    assert.throws(() => parseProposalRequestObject(value), (error: unknown) => {
      return error instanceof QuoteProposalPersistenceError && (error as QuoteProposalPersistenceError).code === "22023";
    });
  }
});

test("maps malformed proposal input errors to deterministic HTTP 400", () => {
  assert.equal(quoteProposalErrorStatus(new QuoteProposalPersistenceError("Invalid proposal request.", "22023")), 400);
  assert.equal(quoteProposalErrorStatus(new QuoteProposalPersistenceError("Invalid JSON.", "22P02")), 400);
});

test("maps retry-safe workflow conflicts to HTTP 409", () => {
  assert.equal(quoteProposalErrorStatus(new QuoteProposalPersistenceError("Stale Quote Workspace row version.", "PT409")), 409);
});


function fakeSupabase(result: unknown) {
  const calls: Array<{ name: string; args: unknown }> = [];
  return {
    calls,
    rpc(name: string, args: unknown) {
      calls.push({ name, args });
      return Promise.resolve(result);
    },
    from(table: string) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        order() {
          return table === "quote_proposals"
            ? { order: () => Promise.resolve({ data: [row], error: null }) }
            : chain;
        },
        in() {
          return Promise.resolve({
            data: [{ id: revisionId, quote_json: { lineItems: [{ ...quote.lineItems[0], clientPrice: 0 }] } }],
            error: null,
          });
        },
      };
      return chain;
    },
  };
}

test("maps snake_case proposal rows to a UI-safe camelCase shape", () => {
  assert.deepEqual(mapQuoteProposalRow(row), { id: proposalId, workspaceId, sourceRevisionId: revisionId, expectedRowVersion: 4, status: "pending", proposedRevision: quote, proposedAssumptions: [" Confirm finish "], proposedEvidence: [{ sourceId: "sheet:1" }], proposedManifestHash: "hash", createdByEmail: "joe@example.com", createdAt: row.created_at, disposedByEmail: null, disposedAt: null, reason: null, editedRevision: null, editedAssumptions: null, editedEvidence: null, dispositionManifestHash: null, acceptedRevisionId: null, creationIdempotencyKey: "create-1", dispositionIdempotencyKey: null });
});

test("derives each proposal delta from its exact immutable source revision", () => {
  const proposal = mapQuoteProposalRow(row);
  const [withDelta] = attachProposalDeltas([proposal], [{
    id: revisionId,
    quote_json: { lineItems: [{ ...quote.lineItems[0], clientPrice: 15 }] },
  }]);
  assert.equal(withDelta.proposalDelta.sellPriceDelta, 5);
  assert.equal(withDelta.proposalDelta.changed[0].itemName, "Fabric");

  const baseline = { ...proposal, sourceRevisionId: null };
  assert.equal(attachProposalDeltas([baseline], [])[0].proposalDelta.added.length, 1);
  assert.throws(() => attachProposalDeltas([proposal], []), /source revision/i);
});

test("lists proposals through the actor-scoped client", async () => {
  const supabase = fakeSupabase(null);
  const result = await listQuoteProposals({ supabase, workspaceId });
  assert.equal(result[0].id, proposalId);
  assert.equal(result[0].proposalDelta.sellPriceDelta, 20);
});

test("rpc accepts exactly one valid row and rejects malformed result shapes", async () => {
  const malformed = [null, [], [row, row], [1], { id: proposalId }, "row"];
  for (const data of malformed) {
    await assert.rejects(() => createQuoteProposal({ supabase: fakeSupabase({ data, error: null }), workspaceId, actorEmail: "joe@example.com", expectedRowVersion: 3, sourceRevisionId: null, quoteJson: quote, assumptions: [], evidence: [], creationIdempotencyKey: "create-1" }), (error: unknown) => error instanceof QuoteProposalPersistenceError);
  }
});

test("create uses the governed RPC and explicit payload", async () => {
  const supabase = fakeSupabase({ data: row, error: null });
  await createQuoteProposal({ supabase, workspaceId, actorEmail: "joe@example.com", expectedRowVersion: 3, sourceRevisionId: revisionId, quoteJson: quote, assumptions: [], evidence: [], creationIdempotencyKey: "create-1" });
  assert.deepEqual(supabase.calls[0], { name: "create_quote_proposal", args: { p_workspace_id: workspaceId, p_actor_email: "joe@example.com", p_expected_row_version: 3, p_source_revision_id: revisionId, p_proposed_revision_json: quote, p_proposed_assumptions_json: [], p_proposed_evidence_json: [], p_creation_idempotency_key: "create-1" } });
});

test("reject and accept use exact governed RPC payloads", async () => {
  const rejectClient = fakeSupabase({ data: row, error: null });
  await rejectQuoteProposal({ supabase: rejectClient, workspaceId, proposalId, actorEmail: "joe@example.com", expectedRowVersion: 4, reason: "Needs review", dispositionIdempotencyKey: "reject-1" });
  assert.equal(rejectClient.calls[0].name, "reject_quote_proposal");
  assert.deepEqual(rejectClient.calls[0].args, { p_workspace_id: workspaceId, p_proposal_id: proposalId, p_actor_email: "joe@example.com", p_expected_row_version: 4, p_reason: "Needs review", p_disposition_idempotency_key: "reject-1" });
  const acceptClient = fakeSupabase({ data: row, error: null });
  await acceptQuoteProposal({ supabase: acceptClient, workspaceId, proposalId, actorEmail: "joe@example.com", expectedRowVersion: 4, editedQuoteJson: quote, editedAssumptions: [], editedEvidence: [], reason: "Approved", dispositionIdempotencyKey: "accept-1" });
  assert.equal(acceptClient.calls[0].name, "accept_quote_proposal");
  assert.deepEqual(acceptClient.calls[0].args, { p_workspace_id: workspaceId, p_proposal_id: proposalId, p_actor_email: "joe@example.com", p_expected_row_version: 4, p_edited_revision_json: quote, p_edited_assumptions_json: [], p_edited_evidence_json: [], p_reason: "Approved", p_disposition_idempotency_key: "accept-1" });
});

test("rejects partial edited acceptance and invalid snapshots before RPC", async () => {
  const supabase = fakeSupabase({ data: row, error: null });
  await assert.rejects(() => acceptQuoteProposal({ supabase, workspaceId, proposalId, actorEmail: "joe@example.com", expectedRowVersion: 4, editedQuoteJson: quote, dispositionIdempotencyKey: "accept-1" }), /complete edited/i);
  await assert.rejects(() => createQuoteProposal({ supabase, workspaceId, actorEmail: "joe@example.com", expectedRowVersion: 3, sourceRevisionId: null, quoteJson: { lineItems: [] }, assumptions: [], evidence: [], creationIdempotencyKey: "create-1" }), /invalid quote structure|non-empty/i);
  assert.equal(supabase.calls.length, 0);
});

test("preserves PostgreSQL error code and message", async () => {
  const supabase = fakeSupabase({ data: null, error: { code: "40001", message: "Stale Quote Workspace row version." } });
  await assert.rejects(() => createQuoteProposal({ supabase, workspaceId, actorEmail: "joe@example.com", expectedRowVersion: 3, sourceRevisionId: null, quoteJson: quote, assumptions: [], evidence: [], creationIdempotencyKey: "create-1" }), (error: unknown) => error instanceof QuoteProposalPersistenceError && error.code === "40001" && error.message === "Stale Quote Workspace row version.");
});
