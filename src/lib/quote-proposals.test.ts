import assert from "node:assert/strict";
import test from "node:test";

import {
  QuoteProposalConflictError,
  QuoteProposalStateError,
  acceptQuoteProposal,
  createQuoteProposal,
  rejectQuoteProposal,
} from "./quote-proposals";

type Revision = { title: string; rows: Array<{ sku: string; quantity: number }> };

const revision: Revision = {
  title: "Original",
  rows: [{ sku: "banner", quantity: 2 }],
};

function pendingProposal() {
  return createQuoteProposal({
    id: "proposal-1",
    workspaceId: "workspace-1",
    sourceRevisionId: "revision-1",
    expectedRowVersion: 7,
    proposedRevision: revision,
    createdBy: "  ESTIMATOR@EXAMPLE.COM ",
    createdAt: "2026-09-08T12:00:00.000Z",
  });
}

test("creates a validated pending proposal with normalized creator and preserved payload", () => {
  const proposal = pendingProposal();

  assert.deepEqual(proposal, {
    id: "proposal-1",
    workspaceId: "workspace-1",
    sourceRevisionId: "revision-1",
    expectedRowVersion: 7,
    proposedRevision: revision,
    createdBy: "estimator@example.com",
    createdAt: "2026-09-08T12:00:00.000Z",
    status: "pending",
  });
  assert.notStrictEqual(proposal.proposedRevision, revision);
  assert.throws(() => createQuoteProposal({ ...pendingProposal(), id: "" }), /id/i);
  assert.throws(() => createQuoteProposal({ ...pendingProposal(), workspaceId: " " }), /workspace/i);
  assert.throws(() => createQuoteProposal({ ...pendingProposal(), createdBy: " " }), /email/i);
  assert.throws(() => createQuoteProposal({ ...pendingProposal(), expectedRowVersion: 0 }), /row version/i);
  assert.throws(() => createQuoteProposal({ ...pendingProposal(), expectedRowVersion: 1.5 }), /row version/i);
});

test("accepts an unedited pending proposal into one deterministic revision request", () => {
  const proposal = pendingProposal();
  const result = acceptQuoteProposal(proposal, {
    currentRowVersion: 7,
    actor: "  REVIEWER@EXAMPLE.COM ",
    disposedAt: "2026-09-08T12:05:00.000Z",
  });

  assert.equal(result.proposal.status, "accepted");
  assert.deepEqual(result.proposal.disposition, {
    actor: "reviewer@example.com",
    disposedAt: "2026-09-08T12:05:00.000Z",
    editedRevision: null,
  });
  assert.deepEqual(result.revisionRequest, {
    workspaceId: "workspace-1",
    parentRevisionId: "revision-1",
    createdFrom: "ada_proposal",
    proposalId: "proposal-1",
    proposedRevision: revision,
    idempotencyKey: "ada-proposal:proposal-1",
  });
  assert.deepEqual(result.events, ["proposal_accepted"]);
});

test("edited acceptance keeps original payload and uses edited payload in request", () => {
  const proposal = pendingProposal();
  const editedRevision: Revision = {
    title: "Edited",
    rows: [{ sku: "banner", quantity: 3 }],
  };
  const result = acceptQuoteProposal(proposal, {
    currentRowVersion: 7,
    actor: "reviewer@example.com",
    disposedAt: "2026-09-08T12:06:00.000Z",
    editedRevision,
  });

  assert.deepEqual(result.proposal.proposedRevision, revision);
  assert.deepEqual(result.proposal.disposition?.editedRevision, editedRevision);
  assert.deepEqual(result.revisionRequest?.proposedRevision, editedRevision);
  assert.deepEqual(result.events, ["proposal_edited", "proposal_accepted"]);
});

test("rejects a pending proposal without a revision request", () => {
  const proposal = pendingProposal();
  const result = rejectQuoteProposal(proposal, {
    currentRowVersion: 7,
    actor: "reviewer@example.com",
    disposedAt: "2026-09-08T12:07:00.000Z",
  });

  assert.equal(result.proposal.status, "rejected");
  assert.equal(result.revisionRequest, null);
  assert.deepEqual(result.proposal.proposedRevision, revision);
  assert.equal(result.proposal.sourceRevisionId, "revision-1");
  assert.deepEqual(result.events, ["proposal_rejected"]);
});

test("stale versions conflict and disposed proposals fail closed", () => {
  const proposal = pendingProposal();
  assert.throws(
    () => acceptQuoteProposal(proposal, { currentRowVersion: 8, actor: "reviewer@example.com", disposedAt: "now" }),
    QuoteProposalConflictError,
  );
  assert.equal(proposal.status, "pending");

  const accepted = acceptQuoteProposal(proposal, { currentRowVersion: 7, actor: "reviewer@example.com", disposedAt: "now" }).proposal;
  assert.throws(() => rejectQuoteProposal(accepted, { currentRowVersion: 7, actor: "reviewer@example.com", disposedAt: "later" }), QuoteProposalStateError);

  const rejected = rejectQuoteProposal(pendingProposal(), { currentRowVersion: 7, actor: "reviewer@example.com", disposedAt: "now" }).proposal;
  assert.throws(() => acceptQuoteProposal(rejected, { currentRowVersion: 7, actor: "reviewer@example.com", disposedAt: "later" }), QuoteProposalStateError);
});

test("disposition does not mutate proposal or revision payload inputs", () => {
  const proposal = pendingProposal();
  const beforeProposal = structuredClone(proposal);
  const editedRevision: Revision = { title: "Edited", rows: [{ sku: "banner", quantity: 4 }] };
  const beforeEditedRevision = structuredClone(editedRevision);

  acceptQuoteProposal(proposal, {
    currentRowVersion: 7,
    actor: "reviewer@example.com",
    disposedAt: "now",
    editedRevision,
  });

  assert.deepEqual(proposal, beforeProposal);
  assert.deepEqual(editedRevision, beforeEditedRevision);
});
