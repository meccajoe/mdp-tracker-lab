import assert from "node:assert/strict";
import test from "node:test";

import {
  QuotePublicationValidationError,
  prepareQuotePublication,
  type QuotePublicationInput,
} from "./quote-publication";

const baseInput = (): QuotePublicationInput => ({
  workspaceId: "workspace-1",
  requestedRevisionId: "revision-7",
  commercialApprovedRevisionId: "revision-7",
  hubspotDealId: "deal-42",
  lifecycleStatus: "commercial_approved",
  normalizationStatus: "normalized",
  lockedAt: "2026-09-14T12:00:00.000Z",
  canonicalManifestHash: "manifest-sha-256",
  currency: "USD",
  expectedTotal: 1250,
  normalizedCommercialLines: [
    {
      lineId: "line-b",
      sortOrder: 2,
      sku: "INSTALL",
      name: "Installation",
      description: "Professional installation",
      quantity: 1,
      unit: "job",
      unitSellPrice: 250,
      amount: 250,
      taxabilityStatus: "taxable",
      quotedHours: 8,
      laborBudget: 80,
      sourceRefs: ["internal-source"],
    },
    {
      lineId: "line-a",
      sortOrder: 1,
      sku: "BANNER",
      name: "Printed banner",
      description: "Finished banner",
      quantity: 2,
      unit: "each",
      unitSellPrice: 500,
      amount: 1000,
      taxabilityStatus: "non_taxable",
      productionNotes: "Internal note",
      margin: 0.4,
      evidenceRefs: ["evidence-1"],
    },
  ],
});

test("prepares an ordered customer-safe publication command with stable identifiers", () => {
  const command = prepareQuotePublication(baseInput());

  assert.deepEqual(command, {
    destination: "hubspot",
    operation: "publish_quote",
    workspaceId: "workspace-1",
    revisionId: "revision-7",
    dealId: "deal-42",
    currency: "USD",
    expectedTotal: 1250,
    lines: [
      {
        lineId: "line-a",
        sortOrder: 1,
        sku: "BANNER",
        name: "Printed banner",
        description: "Finished banner",
        quantity: 2,
        unit: "each",
        unitSellPrice: 500,
        amount: 1000,
        taxabilityStatus: "non_taxable",
        currency: "USD",
        approvedRevisionId: "revision-7",
        manifestHash: "manifest-sha-256",
      },
      {
        lineId: "line-b",
        sortOrder: 2,
        sku: "INSTALL",
        name: "Installation",
        description: "Professional installation",
        quantity: 1,
        unit: "job",
        unitSellPrice: 250,
        amount: 250,
        taxabilityStatus: "taxable",
        currency: "USD",
        approvedRevisionId: "revision-7",
        manifestHash: "manifest-sha-256",
      },
    ],
    payloadHash: command.payloadHash,
    idempotencyKey: "hubspot:quote_workspace:workspace-1:revision:revision-7:publish_quote:deal:deal-42",
  });
  assert.match(command.payloadHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(command).includes("quotedHours"), false);
  assert.equal(JSON.stringify(command).includes("laborBudget"), false);
  assert.equal(JSON.stringify(command).includes("sourceRefs"), false);
  assert.equal(JSON.stringify(command).includes("evidenceRefs"), false);
  assert.equal(JSON.stringify(command).includes("productionNotes"), false);
});

test("fails closed when the requested revision is not the commercially approved revision", () => {
  assert.throws(
    () => prepareQuotePublication({ ...baseInput(), requestedRevisionId: "revision-8" }),
    QuotePublicationValidationError,
  );
});

test("fails closed unless lifecycle and normalization are publication-ready", () => {
  assert.throws(() => prepareQuotePublication({ ...baseInput(), lifecycleStatus: "internal_review" }), QuotePublicationValidationError);
  assert.throws(() => prepareQuotePublication({ ...baseInput(), normalizationStatus: "needs_review" }), QuotePublicationValidationError);
  assert.throws(() => prepareQuotePublication({ ...baseInput(), lockedAt: null }), QuotePublicationValidationError);
});

test("fails closed for blank identity or manifest fields and non-USD currency", () => {
  for (const field of ["workspaceId", "requestedRevisionId", "commercialApprovedRevisionId", "hubspotDealId", "canonicalManifestHash"] as const) {
    assert.throws(() => prepareQuotePublication({ ...baseInput(), [field]: " " }), QuotePublicationValidationError);
  }
  assert.throws(() => prepareQuotePublication({ ...baseInput(), currency: "CAD" }), QuotePublicationValidationError);
});

test("fails closed for empty lines and duplicate, non-integer, or negative ordering", () => {
  assert.throws(() => prepareQuotePublication({ ...baseInput(), normalizedCommercialLines: [] }), QuotePublicationValidationError);
  for (const sortOrder of [1.5, -1]) {
    assert.throws(
      () => prepareQuotePublication({ ...baseInput(), normalizedCommercialLines: [{ ...baseInput().normalizedCommercialLines[0], sortOrder }, baseInput().normalizedCommercialLines[1]] }),
      QuotePublicationValidationError,
    );
  }
  assert.throws(
    () => prepareQuotePublication({ ...baseInput(), normalizedCommercialLines: baseInput().normalizedCommercialLines.map((line) => ({ ...line, sortOrder: 1 })) }),
    QuotePublicationValidationError,
  );
});

test("fails closed for invalid or negative numeric line values and total mismatches", () => {
  for (const field of ["quantity", "unitSellPrice", "amount"] as const) {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const lines = baseInput().normalizedCommercialLines.map((line, index) => index === 0 ? { ...line, [field]: value } : line);
      assert.throws(() => prepareQuotePublication({ ...baseInput(), normalizedCommercialLines: lines }), QuotePublicationValidationError);
    }
  }
  assert.doesNotThrow(() => prepareQuotePublication({ ...baseInput(), expectedTotal: 1250.01 }));
  assert.throws(() => prepareQuotePublication({ ...baseInput(), expectedTotal: 1250.02 }), QuotePublicationValidationError);
});

test("uses stable canonical hashing across object key insertion order", () => {
  const first = prepareQuotePublication(baseInput());
  const input = baseInput();
  input.normalizedCommercialLines = input.normalizedCommercialLines.map((line) => ({
    amount: line.amount,
    taxabilityStatus: line.taxabilityStatus,
    description: line.description,
    unitSellPrice: line.unitSellPrice,
    quantity: line.quantity,
    unit: line.unit,
    name: line.name,
    sku: line.sku,
    sortOrder: line.sortOrder,
    lineId: line.lineId,
  }));
  const second = prepareQuotePublication(input);
  assert.equal(first.payloadHash, second.payloadHash);
  assert.equal(first.idempotencyKey, second.idempotencyKey);
});

test("keeps the idempotency key stable while changing the payload hash", () => {
  const first = prepareQuotePublication(baseInput());
  const second = prepareQuotePublication({ ...baseInput(), normalizedCommercialLines: baseInput().normalizedCommercialLines.map((line) => line.lineId === "line-a" ? { ...line, name: "Updated banner" } : line) });
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.notEqual(first.payloadHash, second.payloadHash);
});

test("does not share mutable input and output state", () => {
  const input = baseInput();
  const command = prepareQuotePublication(input);
  command.lines[0].name = "Changed output";
  command.lines.push({ ...command.lines[0], lineId: "new-line", sortOrder: 3 });
  assert.equal(input.normalizedCommercialLines[0].name, "Installation");
  assert.equal(input.normalizedCommercialLines.length, 2);

  input.normalizedCommercialLines[0].name = "Changed input";
  assert.equal(command.lines[0].name, "Changed output");
});
