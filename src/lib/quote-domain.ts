export const QUOTE_LIFECYCLE_STATUSES = [
  "intake",
  "draft",
  "internal_review",
  "commercial_approved",
  "published_verified",
  "customer_accepted",
  "production_readiness_confirmed",
  "operational_release_approved",
  "release_approved_pending_provisioning",
  "operationally_released",
  "active_project",
  "completed",
  "postmortem_review",
  "closed",
  "archived",
  "cancelled",
  "expired",
  "blocked",
  "superseded",
] as const;

export type QuoteLifecycleStatus = (typeof QUOTE_LIFECYCLE_STATUSES)[number];
export type QuoteNormalizationStatus = "pending" | "normalized" | "needs_review" | "mismatch";

export type QuoteLifecycleEvent =
  | { type: "workspace_created" }
  | { type: "revision_created" }
  | { type: "revision_submitted_for_review" }
  | { type: "commercial_approved"; normalizationStatus: QuoteNormalizationStatus; manifestStable: boolean }
  | { type: "publication_succeeded"; readbackVerified: boolean }
  | { type: "customer_accepted"; acceptanceMatchesPublishedRevision: boolean }
  | { type: "production_readiness_confirmed"; readinessComplete: boolean }
  | { type: "operational_release_approved" }
  | { type: "operationally_released"; qbtVerified: boolean; billVerified: boolean; billExceptionApproved?: boolean }
  | { type: "project_activated" }
  | { type: "project_completed" }
  | { type: "postmortem_started" }
  | { type: "postmortem_approved" };

export class QuoteTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteTransitionError";
  }
}

function requireState(actual: QuoteLifecycleStatus, expected: QuoteLifecycleStatus, event: QuoteLifecycleEvent["type"]) {
  if (actual !== expected) throw new QuoteTransitionError(`${event} requires ${expected}; received ${actual}.`);
}

export function transitionQuoteLifecycle(current: QuoteLifecycleStatus, event: QuoteLifecycleEvent): QuoteLifecycleStatus {
  switch (event.type) {
    case "workspace_created":
      requireState(current, "intake", event.type);
      return "intake";
    case "revision_created":
      if (!["intake", "draft", "internal_review"].includes(current)) throw new QuoteTransitionError(`revision_created is not valid from ${current}.`);
      return "draft";
    case "revision_submitted_for_review":
      requireState(current, "draft", event.type);
      return "internal_review";
    case "commercial_approved":
      requireState(current, "internal_review", event.type);
      if (event.normalizationStatus !== "normalized" || !event.manifestStable) throw new QuoteTransitionError("Commercial approval requires a stable normalized manifest.");
      return "commercial_approved";
    case "publication_succeeded":
      requireState(current, "commercial_approved", event.type);
      if (!event.readbackVerified) throw new QuoteTransitionError("Publication requires exact external read-back verification.");
      return "published_verified";
    case "customer_accepted":
      requireState(current, "published_verified", event.type);
      if (!event.acceptanceMatchesPublishedRevision) throw new QuoteTransitionError("Acceptance must match the published revision.");
      return "customer_accepted";
    case "production_readiness_confirmed":
      requireState(current, "customer_accepted", event.type);
      if (!event.readinessComplete) throw new QuoteTransitionError("Production readiness has blocking exceptions.");
      return "production_readiness_confirmed";
    case "operational_release_approved":
      requireState(current, "production_readiness_confirmed", event.type);
      return "release_approved_pending_provisioning";
    case "operationally_released":
      requireState(current, "release_approved_pending_provisioning", event.type);
      if (!event.qbtVerified || (!event.billVerified && !event.billExceptionApproved)) throw new QuoteTransitionError("Operational release requires QBT and BILL provisioning evidence or an approved BILL exception.");
      return "operationally_released";
    case "project_activated":
      requireState(current, "operationally_released", event.type);
      return "active_project";
    case "project_completed":
      requireState(current, "active_project", event.type);
      return "completed";
    case "postmortem_started":
      requireState(current, "completed", event.type);
      return "postmortem_review";
    case "postmortem_approved":
      requireState(current, "postmortem_review", event.type);
      return "closed";
  }
}

export function canEditQuoteRevision(revision: { lockedAt: string | null }): boolean {
  return revision.lockedAt === null;
}

export function validateWorkPackageIdentity(input: { id: string; workspaceId: string; projectId: string | null; itemNumber: number }): void {
  if (!input.id.trim()) throw new Error("A work package requires an immutable id.");
  if (!input.workspaceId.trim()) throw new Error("A work package requires workspace context.");
  if (!Number.isInteger(input.itemNumber) || input.itemNumber <= 0) throw new Error("A work package requires a positive item number.");
}
