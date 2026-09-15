import assert from "node:assert/strict";
import test from "node:test";
import { preparePublicationReconciliationUpdate, PublicationReconciliationValidationError } from "./integration-outbox";

const base = {
  currentStatus: "processing" as const,
  currentLeaseOwner: "worker-a",
  expectedLeaseOwner: "worker-a",
  payloadHash: "a".repeat(64),
  externalIdentity: "deal-123",
  readbackJson: { id: "deal-123", amount: 100 },
  readbackHash: "a".repeat(64),
};

test("matching publication read-back produces succeeded verified update with cloned evidence", () => {
  const result = preparePublicationReconciliationUpdate(base);
  assert.deepEqual(result, {
    status: "succeeded",
    reconciliationStatus: "verified",
    externalIdentity: "deal-123",
    externalReadbackJson: { id: "deal-123", amount: 100 },
    externalReadbackHash: "a".repeat(64),
    reconciledAt: null,
    completedAt: "set_by_database",
    lastErrorCode: null,
    lastErrorMessage: null,
  });
  assert.notStrictEqual(result.externalReadbackJson, base.readbackJson);
});

test("hash drift is terminal and deterministic, never retryable", () => {
  const result = preparePublicationReconciliationUpdate({ ...base, readbackHash: "b".repeat(64) });
  assert.equal(result.status, "terminal_failed");
  assert.equal(result.reconciliationStatus, "drifted");
  assert.equal(result.lastErrorCode, "PUBLICATION_READBACK_HASH_MISMATCH");
  assert.equal(result.lastErrorMessage, "Publication read-back hash did not match the prepared payload.");
  assert.equal(result.completedAt, null);
});

test("reconciliation rejects unsafe or incomplete state without echoing values", () => {
  for (const patch of [
    { currentStatus: "pending" },
    { currentLeaseOwner: " ", expectedLeaseOwner: "worker-a" },
    { payloadHash: "UPPER" },
    { externalIdentity: " " },
    { readbackJson: [] },
    { readbackJson: { authorization: "secret-value" } },
  ]) {
    assert.throws(
      () => preparePublicationReconciliationUpdate({ ...base, ...patch } as typeof base),
      (error: unknown) => error instanceof PublicationReconciliationValidationError && !String(error).includes("secret-value"),
    );
  }
});
