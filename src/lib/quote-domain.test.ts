import assert from "node:assert/strict";
import test from "node:test";

import {
  QUOTE_LIFECYCLE_STATUSES,
  QuoteTransitionError,
  canEditQuoteRevision,
  transitionQuoteLifecycle,
  validateWorkPackageIdentity,
} from "./quote-domain";
import {
  type QuoteActor,
  type QuoteCapability,
  canPerformQuoteAction,
} from "./quote-permissions";

const capabilities = (...values: QuoteCapability[]) => values;

const estimator: QuoteActor = {
  email: "estimator@example.com",
  systemRole: "viewer",
  workspaceRole: "editor",
  isActiveMember: true,
  capabilities: capabilities(),
};
const viewer: QuoteActor = {
  email: "viewer@example.com",
  systemRole: "viewer",
  workspaceRole: "viewer",
  isActiveMember: true,
  capabilities: capabilities(),
};
const pm: QuoteActor = {
  email: "pm@example.com",
  systemRole: "pm",
  workspaceRole: "reviewer",
  isActiveMember: true,
  capabilities: capabilities("record_manual_acceptance"),
};
const commercialApprover: QuoteActor = {
  email: "commercial@example.com",
  systemRole: "admin",
  workspaceRole: "owner",
  isActiveMember: true,
  capabilities: capabilities("approve_commercial", "request_publication", "approve_release", "approve_change", "approve_lesson"),
};
const operations: QuoteActor = {
  email: "operations@example.com",
  systemRole: "production",
  workspaceRole: "editor",
  isActiveMember: true,
  capabilities: capabilities("confirm_readiness", "execute_release", "classify_operational_cause", "correct_labor_coding"),
};
const breakGlassAdmin: QuoteActor = {
  email: "admin@example.com",
  systemRole: "admin",
  workspaceRole: "owner",
  isActiveMember: true,
  capabilities: capabilities("break_glass"),
  breakGlassReason: "Named approver is unavailable during an incident.",
};

test("the lifecycle declares every canonical state once", () => {
  assert.equal(new Set(QUOTE_LIFECYCLE_STATUSES).size, QUOTE_LIFECYCLE_STATUSES.length);
  assert.deepEqual(QUOTE_LIFECYCLE_STATUSES.slice(0, 4), ["intake", "draft", "internal_review", "commercial_approved"]);
  assert.ok(QUOTE_LIFECYCLE_STATUSES.includes("release_approved_pending_provisioning"));
  assert.ok(QUOTE_LIFECYCLE_STATUSES.includes("operationally_released"));
});

test("canonical lifecycle gates cannot be collapsed or skipped", () => {
  assert.equal(transitionQuoteLifecycle("draft", { type: "revision_submitted_for_review" }), "internal_review");
  assert.equal(transitionQuoteLifecycle("internal_review", { type: "commercial_approved", normalizationStatus: "normalized", manifestStable: true }), "commercial_approved");
  assert.equal(transitionQuoteLifecycle("commercial_approved", { type: "publication_succeeded", readbackVerified: true }), "published_verified");
  assert.equal(transitionQuoteLifecycle("published_verified", { type: "customer_accepted", acceptanceMatchesPublishedRevision: true }), "customer_accepted");
  assert.equal(transitionQuoteLifecycle("customer_accepted", { type: "production_readiness_confirmed", readinessComplete: true }), "production_readiness_confirmed");
  assert.equal(transitionQuoteLifecycle("production_readiness_confirmed", { type: "operational_release_approved" }), "release_approved_pending_provisioning");
  assert.equal(transitionQuoteLifecycle("release_approved_pending_provisioning", { type: "operationally_released", qbtVerified: true, billVerified: true }), "operationally_released");
});

test("commercial approval requires a stable normalized revision", () => {
  assert.throws(() => transitionQuoteLifecycle("internal_review", { type: "commercial_approved", normalizationStatus: "needs_review", manifestStable: false }), QuoteTransitionError);
  assert.throws(() => transitionQuoteLifecycle("internal_review", { type: "commercial_approved", normalizationStatus: "normalized", manifestStable: false }), QuoteTransitionError);
});

test("publication acceptance readiness approval and release each enforce their own evidence", () => {
  assert.throws(() => transitionQuoteLifecycle("commercial_approved", { type: "publication_succeeded", readbackVerified: false }), QuoteTransitionError);
  assert.throws(() => transitionQuoteLifecycle("published_verified", { type: "customer_accepted", acceptanceMatchesPublishedRevision: false }), QuoteTransitionError);
  assert.throws(() => transitionQuoteLifecycle("customer_accepted", { type: "production_readiness_confirmed", readinessComplete: false }), QuoteTransitionError);
  assert.throws(() => transitionQuoteLifecycle("production_readiness_confirmed", { type: "operationally_released", qbtVerified: true, billVerified: true }), QuoteTransitionError);
  assert.throws(() => transitionQuoteLifecycle("release_approved_pending_provisioning", { type: "operationally_released", qbtVerified: false, billVerified: true }), QuoteTransitionError);
  assert.equal(transitionQuoteLifecycle("release_approved_pending_provisioning", { type: "operationally_released", qbtVerified: true, billVerified: false, billExceptionApproved: true }), "operationally_released");
});

test("locked revisions and project-scoped work package identity fail closed", () => {
  assert.equal(canEditQuoteRevision({ lockedAt: null }), true);
  assert.equal(canEditQuoteRevision({ lockedAt: "2026-09-03T00:00:00Z" }), false);
  assert.doesNotThrow(() => validateWorkPackageIdentity({ id: "3b4e9370-a3aa-4d02-a1c4-7ffdbf2d9102", workspaceId: "workspace", projectId: "project", itemNumber: 1 }));
  assert.throws(() => validateWorkPackageIdentity({ id: "3b4e9370-a3aa-4d02-a1c4-7ffdbf2d9102", workspaceId: "", projectId: null, itemNumber: 1 }), /workspace context/i);
});

test("workspace membership permits ordinary collaboration but never grants privileged authority", () => {
  for (const actor of [estimator, pm, commercialApprover, operations, breakGlassAdmin]) {
    assert.equal(canPerformQuoteAction(actor, "view_workspace"), true);
    assert.equal(canPerformQuoteAction(actor, "edit_draft"), true);
    assert.equal(canPerformQuoteAction(actor, "submit_revision"), true);
  }
  assert.equal(canPerformQuoteAction(estimator, "approve_commercial"), false);
  assert.equal(canPerformQuoteAction(pm, "approve_commercial"), false);
  assert.equal(canPerformQuoteAction(operations, "approve_commercial"), false);
  assert.equal(canPerformQuoteAction(commercialApprover, "approve_commercial"), true);
  assert.equal(canPerformQuoteAction(estimator, "attach_evidence"), true);
  assert.equal(canPerformQuoteAction(viewer, "view_workspace"), true);
  assert.equal(canPerformQuoteAction(viewer, "edit_draft"), false);
  assert.equal(canPerformQuoteAction(viewer, "attach_evidence"), false);
  assert.equal(canPerformQuoteAction(commercialApprover, "archive_workspace"), false);
  assert.equal(canPerformQuoteAction(commercialApprover, "restore_workspace"), false);
  const lifecycleAdministrator = { ...commercialApprover, capabilities: [...commercialApprover.capabilities, "archive_workspace" as const] };
  assert.equal(canPerformQuoteAction(lifecycleAdministrator, "archive_workspace"), true);
  assert.equal(canPerformQuoteAction(lifecycleAdministrator, "restore_workspace"), true);
});

test("commercial and operations authority remains separate and capability-driven", () => {
  assert.equal(canPerformQuoteAction(commercialApprover, "approve_release"), true);
  assert.equal(canPerformQuoteAction(commercialApprover, "execute_release"), false);
  assert.equal(canPerformQuoteAction(operations, "confirm_readiness"), true);
  assert.equal(canPerformQuoteAction(operations, "execute_release"), true);
  assert.equal(canPerformQuoteAction(operations, "approve_release"), false);
  assert.equal(canPerformQuoteAction(pm, "record_manual_acceptance"), true);
});

test("admin break glass requires both capability and a recorded reason", () => {
  assert.equal(canPerformQuoteAction(breakGlassAdmin, "approve_commercial"), true);
  assert.equal(canPerformQuoteAction({ ...breakGlassAdmin, breakGlassReason: "" }, "approve_commercial"), false);
  assert.equal(canPerformQuoteAction({ ...breakGlassAdmin, capabilities: [] }, "approve_commercial"), false);
});

test("removed members and service-role-shaped callers receive no workspace authority", () => {
  assert.equal(canPerformQuoteAction({ ...estimator, isActiveMember: false }, "view_workspace"), false);
  assert.equal(canPerformQuoteAction({ email: "service@example.com", systemRole: "service_role", workspaceRole: null, isActiveMember: false, capabilities: ["approve_commercial"] }, "approve_commercial"), false);
});
