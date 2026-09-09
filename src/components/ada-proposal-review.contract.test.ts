import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./ada-proposal-review.tsx", import.meta.url), "utf8");
const helperSource = readFileSync(new URL("../lib/ada-proposal-review.ts", import.meta.url), "utf8");

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
  assert.match(source, /Confirm rejection/);
  assert.match(source, /rejectionReasonLength/);
  assert.doesNotMatch(source, /maxLength=\{2000\}/);
  assert.match(helperSource, /dispositionIdempotencyKey/);
});

test("Ada proposal review only closes after a successful disposition and preserves edited snapshots", () => {
  assert.match(source, /buildProposalAcceptanceRequest/);
  assert.match(helperSource, /quoteJson: editedSnapshot\.quoteJson/);
  assert.match(helperSource, /assumptions: editedSnapshot\.assumptions/);
  assert.match(helperSource, /evidence: editedSnapshot\.evidence/);
  assert.match(source, /onAccept\(proposal\.id/);
  assert.match(source, /onEditAccept\(proposal\.id/);
  assert.match(source, /catch \(error\)[\s\S]*setError|setDispositionError/);
  assert.doesNotMatch(source, /crypto\.randomUUID\(\)|Date\.now\(\)/);
});

test("Ada proposal review keeps edits bounded to complete quote snapshots", () => {
  assert.match(source, /updateLine/);
  assert.match(source, /normalizeEditedProposalSnapshot/);
  assert.match(source, /editedSnapshotIsValid/);
  assert.doesNotMatch(source, /Number\(value\)/);
  assert.match(source, /setSnapshot/);
  assert.match(source, /evidence/);
  assert.match(source, /edited/);
  assert.match(source, /type="number"/);
  assert.match(source, /required/);
  assert.match(source, /aria-label="Edit proposal assumptions"/);
});

test("Ada proposal review renders the persisted proposal delta and lifecycle boundary", () => {
  assert.match(source, /internalCostDelta/);
  assert.match(source, /Added lines/);
  assert.match(source, /Removed lines/);
  assert.match(source, /Changed lines/);
  assert.match(source, /proposalDelta\?\.added/);
  assert.match(source, /proposalDelta\?\.removed/);
  assert.match(source, /proposalDelta\?\.changed/);
  assert.match(source, /evidenceRefs/);
  assert.match(source, /describeProposalEvidence/);
  assert.match(source, /onOpenEvidence/);
  assert.match(source, /Added/);
  assert.match(source, /Removed/);
  assert.match(source, /Changed/);
  assert.match(source, /draft canonical revision/);
  assert.match(source, /does not commercially approve, publish, create a project, provision downstream systems, or operationally release/);
});

test("Ada proposal review has an explicit close action", () => {
  assert.match(source, /onClose: \(\) => void/);
  assert.match(source, /aria-label="Close proposal review"/);
  assert.match(source, /onClick=\{onClose\}/);
});

test("Ada workspace gives proposal review the same focused-pane behavior as other panes", () => {
  const workspace = readFileSync(new URL("./ada-workspace-detail.tsx", import.meta.url), "utf8");
  assert.match(workspace, /onClose=\{\(\) => setShowProposal\(false\)\}/);
  assert.match(workspace, /showProposal \|\| showEvidence \|\| showIntelligence \|\| showQuote/);
  assert.match(workspace, /setShowEvidence\(false\)/);
  assert.match(workspace, /setShowIntelligence\(false\)/);
  assert.match(workspace, /body: JSON\.stringify\(request\)/);
  assert.match(workspace, /quoteJson\?: unknown/);
  assert.match(workspace, /assumptions\?: string\[\]/);
  assert.match(workspace, /evidence\?: unknown\[\]/);
  assert.match(workspace, /throw new Error\(message\)/);
  assert.match(workspace, /Promise\.all\(\[load\(\), loadProposal\(\)\]\)/);
});

test("Ada workspace links proposals to their originating assistant messages and overlays live status", () => {
  const workspace = readFileSync(new URL("./ada-workspace-detail.tsx", import.meta.url), "utf8");
  assert.match(workspace, /proposal\?: AdaProposalReviewData/);
  assert.match(workspace, /proposalDelta\?:/);
  assert.match(workspace, /proposalById/);
  assert.match(workspace, /Review proposal/);
  assert.match(workspace, /pendingProposals/);
  assert.match(workspace, /Review proposal \{index \+ 1\}/);
  assert.match(workspace, /pendingProposals\.map/);
  assert.doesNotMatch(workspace, /pendingProposals\[0\]/);
  assert.match(workspace, /liveProposal\.proposalDelta/);
  assert.match(workspace, /onOpenEvidence/);
  assert.match(workspace, /result\.proposal/);
  assert.match(workspace, /acceptedRevisionId/);
  assert.match(workspace, /setShowQuote\(true\)/);
  assert.match(workspace, /response\.status === 409/);
  assert.match(workspace, /proposal changed/);
  assert.doesNotMatch(workspace, /Open proposal review/);
});

test("proposal detail renders immutable before/after line evidence with stable occurrence keys", () => {
  assert.match(source, /change\.line/);
  assert.match(source, /change\.before/);
  assert.match(source, /change\.after/);
  assert.match(source, /stableOccurrenceKey/);
  assert.match(source, /LineSnapshotDetails/);
  assert.match(source, /LineEvidenceRefs/);
  assert.match(source, /confidence/);
  assert.match(source, /pricingBasis/);
  assert.match(source, /assumption/);
  assert.doesNotMatch(source, /key=\{item\}/);
});