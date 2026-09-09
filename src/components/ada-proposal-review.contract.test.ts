import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./ada-proposal-review.tsx", import.meta.url), "utf8");

test("Ada proposal review exposes structured responsive review sections", () => {
  assert.match(source, /export function AdaProposalReview/);
  assert.match(source, /aria-label="Proposal review"/);
  assert.match(source, /lineItems/);
  assert.match(source, /Assumptions/);
  assert.match(source, /Evidence/);
  assert.match(source, /grid-cols-1[\s\S]*md:grid-cols/);
  assert.match(source, /overflow-x-auto/);
});

test("Ada proposal review exposes accept, edit-accept, and reject actions", () => {
  assert.match(source, /Accept proposal/);
  assert.match(source, /Edit (?:&|&amp;) accept/);
  assert.match(source, /Reject proposal/);
  assert.match(source, /onAccept/);
  assert.match(source, /onEditAccept/);
  assert.match(source, /onReject/);
  assert.match(source, /dispositionIdempotencyKey/);
});

test("Ada proposal review keeps edits bounded to complete quote snapshots", () => {
  assert.match(source, /quoteJson/);
  assert.match(source, /assumptions/);
  assert.match(source, /evidence/);
  assert.match(source, /edited/);
  assert.match(source, /type="number"/);
  assert.match(source, /required/);
});
