export const QUOTE_CAPABILITIES = [
  "create_workspace",
  "edit_draft",
  "submit_review",
  "attach_evidence",
  "approve_commercial",
  "request_publication",
  "verify_publication",
  "record_manual_acceptance",
  "confirm_readiness",
  "approve_release",
  "execute_release",
  "approve_change",
  "classify_operational_cause",
  "correct_labor_coding",
  "approve_postmortem",
  "approve_lesson",
  "archive_workspace",
  "block_release",
  "break_glass",
] as const;

export type QuoteCapability = (typeof QUOTE_CAPABILITIES)[number];
export type QuoteWorkspaceRole = "owner" | "editor" | "reviewer" | "viewer";
export type QuoteAction =
  | "view_workspace"
  | "edit_draft"
  | "attach_evidence"
  | "submit_revision"
  | "archive_workspace"
  | "restore_workspace"
  | "approve_commercial"
  | "request_publication"
  | "record_manual_acceptance"
  | "confirm_readiness"
  | "approve_release"
  | "execute_release"
  | "request_change"
  | "approve_change"
  | "classify_operational_cause"
  | "correct_labor_coding"
  | "approve_postmortem"
  | "approve_lesson";

export interface QuoteActor {
  email: string;
  systemRole: string | null;
  workspaceRole: QuoteWorkspaceRole | null;
  isActiveMember: boolean;
  capabilities: QuoteCapability[];
  breakGlassReason?: string | null;
}

const ordinaryRoles = new Set<QuoteWorkspaceRole>(["owner", "editor", "reviewer"]);
const privilegedCapability: Partial<Record<QuoteAction, QuoteCapability>> = {
  archive_workspace: "archive_workspace",
  restore_workspace: "archive_workspace",
  approve_commercial: "approve_commercial",
  request_publication: "request_publication",
  record_manual_acceptance: "record_manual_acceptance",
  confirm_readiness: "confirm_readiness",
  approve_release: "approve_release",
  execute_release: "execute_release",
  approve_change: "approve_change",
  classify_operational_cause: "classify_operational_cause",
  correct_labor_coding: "correct_labor_coding",
  approve_postmortem: "approve_postmortem",
  approve_lesson: "approve_lesson",
};

export function canPerformQuoteAction(actor: QuoteActor, action: QuoteAction): boolean {
  if (!actor.email.trim() || !actor.isActiveMember || !actor.workspaceRole) return false;
  if (action === "view_workspace") return true;
  if (action === "edit_draft" || action === "attach_evidence" || action === "submit_revision" || action === "request_change") return ordinaryRoles.has(actor.workspaceRole);

  // Both governed database lifecycle functions authorize active workspace owners.
  if ((action === "archive_workspace" || action === "restore_workspace") && actor.workspaceRole === "owner") return true;

  const required = privilegedCapability[action];
  if (!required) return false;
  if (actor.capabilities.includes(required)) return true;
  return actor.capabilities.includes("break_glass") && Boolean(actor.breakGlassReason?.trim());
}

export interface QuoteWorkspaceAuthorizationRow {
  workspace_role: QuoteWorkspaceRole;
  removed_at: string | null;
}

export function buildQuoteActor(input: {
  email: string;
  systemRole: string | null;
  membership: QuoteWorkspaceAuthorizationRow | null;
  capabilities: Array<{ capability: QuoteCapability; revoked_at: string | null }>;
  breakGlassReason?: string | null;
}): QuoteActor {
  return {
    email: input.email.trim().toLowerCase(),
    systemRole: input.systemRole,
    workspaceRole: input.membership?.removed_at ? null : input.membership?.workspace_role ?? null,
    isActiveMember: Boolean(input.membership && !input.membership.removed_at),
    capabilities: input.capabilities.filter((row) => !row.revoked_at).map((row) => row.capability),
    breakGlassReason: input.breakGlassReason,
  };
}

export interface QuoteWorkspaceActions {
  rename: boolean;
  archive: boolean;
  restore: boolean;
}

// Presentation permissions are derived from the same actor policy as route guards.
// The API still rechecks identity, membership, capabilities and lifecycle on mutation.
export function quoteWorkspaceActions(actor: QuoteActor, lifecycle: string): QuoteWorkspaceActions {
  const archived = lifecycle === "archived";
  return {
    rename: !archived && canPerformQuoteAction(actor, "edit_draft"),
    archive: !archived && canPerformQuoteAction(actor, "archive_workspace"),
    restore: archived && canPerformQuoteAction(actor, "restore_workspace"),
  };
}
