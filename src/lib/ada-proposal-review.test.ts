import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProposalAcceptanceRequest,
  buildProposalRejectionRequest,
  cloneProposalSnapshot,
  normalizeEditedProposalSnapshot,
  describeProposalEvidence,
  proposalDispositionIdempotencyKey,
} from "./ada-proposal-review";

const proposal = {
  id: "018f3f8e-7a34-7d4b-8d90-123456789abc",
  expectedRowVersion: 7,
  proposedRevision: {
    lineItems: [
      {
        itemName: "SEG wall",
        buildItem: "Item 01",
        lineType: "material",
        internalCost: 1200,
        clientPrice: 1800,
        confidence: "high",
        evidenceRefs: ["asset:drawing-1:page:2"],
        pricingBasis: "pricebook",
      },
    ],
  },
  proposedAssumptions: ["Client provides power"],
  proposedEvidence: [{ sourceId: "drawing-1", page: 2 }],
};

test("proposal disposition idempotency keys are deterministic by proposal and disposition class", () => {
  assert.equal(
    proposalDispositionIdempotencyKey(proposal.id, "accept"),
    `quote-proposal:${proposal.id}:accept`,
  );
  assert.equal(
    proposalDispositionIdempotencyKey(proposal.id, "accept"),
    proposalDispositionIdempotencyKey(proposal.id, "accept"),
  );
  assert.equal(
    proposalDispositionIdempotencyKey(proposal.id, "reject"),
    `quote-proposal:${proposal.id}:reject`,
  );
});

test("edited numeric values preserve blanks until validation and normalize valid input", () => {
  const snapshot = cloneProposalSnapshot(proposal);
  snapshot.quoteJson.lineItems[0].internalCost = "12.50";
  snapshot.quoteJson.lineItems[0].clientPrice = "25";

  assert.deepEqual(normalizeEditedProposalSnapshot(snapshot).quoteJson.lineItems[0], {
    ...proposal.proposedRevision.lineItems[0],
    internalCost: 12.5,
    clientPrice: 25,
  });

  for (const invalid of ["", "   ", "not-a-number", -1, Number.POSITIVE_INFINITY]) {
    const invalidSnapshot = cloneProposalSnapshot(proposal);
    invalidSnapshot.quoteJson.lineItems[0].clientPrice = invalid;
    assert.throws(
      () => normalizeEditedProposalSnapshot(invalidSnapshot),
      /finite, non-negative number/,
    );
  }
});

test("evidence descriptors expose labels and safe asset review targets", () => {
  assert.deepEqual(
    describeProposalEvidence({ sourceId: "asset:abc-123", label: "Floor plan", page: 4 }, 0),
    { label: "Floor plan", assetId: "abc-123", pageNumber: 4 },
  );
  assert.deepEqual(
    describeProposalEvidence({ sourceId: "materials:seg", label: "SEG fabric" }, 1),
    { label: "SEG fabric", assetId: null, pageNumber: null },
  );
  assert.deepEqual(
    describeProposalEvidence({ unexpected: true }, 2),
    { label: "Evidence 3", assetId: null, pageNumber: null },
  );
  assert.deepEqual(describeProposalEvidence("asset:drawing-2:page:7", 3), {
    label: "asset:drawing-2:page:7",
    assetId: "drawing-2",
    pageNumber: 7,
  });
});

test("edited acceptance uses the exact complete API snapshot trio without mutating proposal evidence", () => {
  const snapshot = cloneProposalSnapshot(proposal);
  snapshot.quoteJson.lineItems[0].clientPrice = 1900;
  snapshot.assumptions.push("Freight excluded");
  const request = buildProposalAcceptanceRequest(proposal, snapshot);

  assert.deepEqual(request, {
    expectedRowVersion: 7,
    dispositionIdempotencyKey: `quote-proposal:${proposal.id}:accept`,
    quoteJson: snapshot.quoteJson,
    assumptions: snapshot.assumptions,
    evidence: snapshot.evidence,
  });
  assert.equal(proposal.proposedRevision.lineItems[0].clientPrice, 1800);
  assert.deepEqual(proposal.proposedAssumptions, ["Client provides power"]);
  assert.deepEqual(proposal.proposedEvidence, [{ sourceId: "drawing-1", page: 2 }]);
});

test("unedited acceptance and rejection use stable minimal request bodies", () => {
  assert.deepEqual(buildProposalAcceptanceRequest(proposal), {
    expectedRowVersion: 7,
    dispositionIdempotencyKey: `quote-proposal:${proposal.id}:accept`,
  });
  assert.deepEqual(buildProposalRejectionRequest(proposal, "  Scope changed  "), {
    expectedRowVersion: 7,
    dispositionIdempotencyKey: `quote-proposal:${proposal.id}:reject`,
    reason: "Scope changed",
  });
});

test("rejection reasons use PostgreSQL-compatible Unicode code-point bounds", () => {
  assert.equal(buildProposalRejectionRequest(proposal, "😀".repeat(2_000)).reason, "😀".repeat(2_000));
  assert.throws(() => buildProposalRejectionRequest(proposal, "😀".repeat(2_001)), /2,000 characters/);
  assert.throws(() => buildProposalRejectionRequest(proposal, "   "), /required/);
});
