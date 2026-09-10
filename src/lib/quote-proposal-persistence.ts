import { validateAdaQuoteSnapshot } from "@/lib/ada-quote-validation";
import { buildAdaRevisionDelta } from "@/lib/ada-quote-revisions";

export type QuoteProposalStatus = "pending" | "accepted" | "rejected";

// Technical transport/storage ceilings shared by the adapter and SQL boundary.
export const MAX_LINE_ITEMS = 500;
export const MAX_ASSUMPTIONS = 200;
export const MAX_EVIDENCE_ENTRIES = 500;
export const MAX_SNAPSHOT_JSON_BYTES = 1_048_576;
export const MAX_REASON_CHARS = 2_000;
const FORMAT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isFormatUuid(value: unknown): value is string {
  return typeof value === "string" && FORMAT_UUID.test(value);
}

export const isUuid = isFormatUuid;
export type QuoteProposal = {
  id: string;
  workspaceId: string;
  sourceRevisionId: string | null;
  expectedRowVersion: number;
  status: QuoteProposalStatus;
  proposedRevision: unknown;
  proposedAssumptions: unknown[];
  proposedEvidence: unknown[];
  proposedManifestHash: string;
  createdByEmail: string;
  createdAt: string;
  disposedByEmail: string | null;
  disposedAt: string | null;
  reason: string | null;
  editedRevision: unknown | null;
  editedAssumptions: unknown[] | null;
  editedEvidence: unknown[] | null;
  dispositionManifestHash: string | null;
  acceptedRevisionId: string | null;
  creationIdempotencyKey: string;
  dispositionIdempotencyKey: string | null;
};

export type QuoteProposalWithDelta = QuoteProposal & {
  proposalDelta: ReturnType<typeof buildAdaRevisionDelta>;
};

export class QuoteProposalPersistenceError extends Error {
  readonly code?: string;
  readonly details?: unknown;
  constructor(message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "QuoteProposalPersistenceError";
    this.code = code;
    this.details = details;
  }
}

export function parseProposalRequestObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new QuoteProposalPersistenceError("Proposal request must be a JSON object.", "22023");
  }
  return value as Record<string, unknown>;
}

export function parseOptionalSourceRevisionId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (isFormatUuid(value)) return value;
  throw new QuoteProposalPersistenceError("sourceRevisionId must be a UUID or null.", "22023");
}

export function parseAcceptanceReason(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new QuoteProposalPersistenceError("Acceptance reason must be a string.", "22023");
  const reason = value.trim();
  if (Array.from(reason).length > MAX_REASON_CHARS) throw new QuoteProposalPersistenceError("Acceptance reason exceeds the bounded technical character limit.", "22023");
  return reason || null;
}

export function parseRejectionReason(value: unknown): string {
  if (typeof value !== "string") throw new QuoteProposalPersistenceError("Rejection reason must be a string.", "22023");
  const reason = value.trim();
  if (!reason || Array.from(reason).length > MAX_REASON_CHARS) throw new QuoteProposalPersistenceError("Rejection reason is required and bounded.", "22023");
  return reason;
}

export function quoteProposalErrorStatus(error: unknown): number {
  const code = error instanceof QuoteProposalPersistenceError ? error.code : undefined;
  if (code === "P0002") return 404;
  if (code === "42501") return 403;
  if (["40001", "PT409", "55000", "23503", "23505", "P0001"].includes(code ?? "")) return 409;
  if (["22023", "22P02"].includes(code ?? "")) return 400;
  return 500;
}

type SupabaseLike = {
  rpc: (...args: any[]) => any;
  from: (table: string) => any;
};
type ProposalRow = Record<string, any>;

export function mapQuoteProposalRow(row: ProposalRow): QuoteProposal {
  if (!row || typeof row !== "object" || typeof row.id !== "string" || typeof row.workspace_id !== "string" ||
      typeof row.status !== "string" || !["pending", "accepted", "rejected"].includes(row.status) ||
      !Number.isSafeInteger(row.expected_row_version) || typeof row.created_at !== "string") {
    throw new QuoteProposalPersistenceError("Proposal persistence returned an invalid row.", "P0001");
  }
  return {
    id: String(row.id), workspaceId: String(row.workspace_id), sourceRevisionId: row.source_revision_id ?? null,
    expectedRowVersion: Number(row.expected_row_version), status: row.status as QuoteProposalStatus,
    proposedRevision: row.proposed_revision_json, proposedAssumptions: row.proposed_assumptions_json ?? [], proposedEvidence: row.proposed_evidence_json ?? [], proposedManifestHash: row.proposed_manifest_hash,
    createdByEmail: row.created_by_email, createdAt: row.created_at, disposedByEmail: row.disposed_by_email ?? null, disposedAt: row.disposed_at ?? null, reason: row.reason ?? null,
    editedRevision: row.edited_revision_json ?? null, editedAssumptions: row.edited_assumptions_json ?? null, editedEvidence: row.edited_evidence_json ?? null,
    dispositionManifestHash: row.disposition_manifest_hash ?? null, acceptedRevisionId: row.accepted_revision_id ?? null,
    creationIdempotencyKey: row.creation_idempotency_key, dispositionIdempotencyKey: row.disposition_idempotency_key ?? null,
  };
}

export function attachProposalDeltas(
  proposals: QuoteProposal[],
  sourceRevisions: Array<{ id: string; quote_json: { lineItems?: unknown[] } }>,
): QuoteProposalWithDelta[] {
  const sourceById = new Map(sourceRevisions.map((revision) => [revision.id, revision]));

  return proposals.map((proposal) => {
    const source = proposal.sourceRevisionId ? sourceById.get(proposal.sourceRevisionId) : null;
    if (proposal.sourceRevisionId && !source) {
      throw new QuoteProposalPersistenceError("Proposal source revision is unavailable.", "P0002");
    }
    const sourceLines = source?.quote_json?.lineItems;
    const proposedLines = (proposal.proposedRevision as { lineItems?: unknown[] }).lineItems;
    if ((sourceLines !== undefined && !Array.isArray(sourceLines)) || !Array.isArray(proposedLines)) {
      throw new QuoteProposalPersistenceError("Proposal revision snapshot is invalid.", "22023");
    }
    return {
      ...proposal,
      proposalDelta: buildAdaRevisionDelta((sourceLines ?? []) as any[], proposedLines as any[]),
    };
  });
}

function persistenceError(error: { code?: string; message: string; details?: unknown }): QuoteProposalPersistenceError {
  return new QuoteProposalPersistenceError(error.message, error.code, error.details);
}
function validated(quoteJson: unknown, assumptions: unknown, evidence: unknown) {
  if (!Array.isArray(assumptions) || !Array.isArray(evidence)) throw new QuoteProposalPersistenceError("Proposal assumptions and evidence must be arrays.", "22023");
  if (assumptions.length > MAX_ASSUMPTIONS || assumptions.some((value) => typeof value !== "string")) throw new QuoteProposalPersistenceError("Proposal assumptions must be bounded string arrays.", "22023");
  if (evidence.length > MAX_EVIDENCE_ENTRIES) throw new QuoteProposalPersistenceError("Proposal evidence is too large.", "22023");
  if (!quoteJson || typeof quoteJson !== "object" || !Array.isArray((quoteJson as { lineItems?: unknown }).lineItems) || (quoteJson as { lineItems: unknown[] }).lineItems.length === 0) throw new QuoteProposalPersistenceError("Proposal revision must contain a non-empty lineItems array.", "22023");
  if ((quoteJson as { lineItems: unknown[] }).lineItems.length > MAX_LINE_ITEMS) throw new QuoteProposalPersistenceError("Proposal lineItems is too large.", "22023");
  for (const line of (quoteJson as { lineItems: unknown[] }).lineItems) {
    if (line !== null && typeof line === "object" && Object.prototype.hasOwnProperty.call(line, "assumption") && typeof (line as { assumption?: unknown }).assumption !== "string") {
      throw new QuoteProposalPersistenceError("Proposal line assumption must be a string when supplied.", "22023");
    }
  }
  const bytes = new TextEncoder().encode(JSON.stringify({ revision: quoteJson, assumptions, evidence })).byteLength;
  if (bytes > MAX_SNAPSHOT_JSON_BYTES) throw new QuoteProposalPersistenceError("Proposal snapshot exceeds the technical size bound.", "22023");
  try { return validateAdaQuoteSnapshot(quoteJson, assumptions, evidence); }
  catch (error) { throw new QuoteProposalPersistenceError(error instanceof Error ? error.message : "Invalid proposal snapshot.", "22023"); }
}
async function rpc(supabase: SupabaseLike, name: string, args: Record<string, unknown>) {
  const result = await supabase.rpc(name, args);
  if (result.error) throw persistenceError(result.error);
  const rows = Array.isArray(result.data) ? result.data : result.data === null || result.data === undefined ? [] : [result.data];
  if (rows.length !== 1) throw new QuoteProposalPersistenceError("Proposal persistence returned an invalid row count.", "P0001");
  return mapQuoteProposalRow(rows[0]);
}

export async function listQuoteProposals({ supabase, workspaceId }: { supabase: SupabaseLike; workspaceId: string }): Promise<QuoteProposalWithDelta[]> {
  const result = await supabase.from("quote_proposals").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).order("id", { ascending: false });
  if (result.error) throw persistenceError(result.error);
  const proposals: QuoteProposal[] = (result.data ?? []).map((row: ProposalRow) => mapQuoteProposalRow(row));
  const sourceIds = [...new Set(proposals.map((proposal) => proposal.sourceRevisionId).filter((id): id is string => Boolean(id)))];
  let sourceRevisions: Array<{ id: string; quote_json: { lineItems?: unknown[] } }> = [];

  if (sourceIds.length > 0) {
    const sourceResult = await supabase.from("ada_quote_revisions").select("id, quote_json").in("id", sourceIds);
    if (sourceResult.error) throw persistenceError(sourceResult.error);
    sourceRevisions = sourceResult.data ?? [];
  }

  return attachProposalDeltas(proposals, sourceRevisions);
}

export async function createQuoteProposal(args: { supabase: SupabaseLike; workspaceId: string; actorEmail: string; expectedRowVersion: number; sourceRevisionId: string | null; quoteJson: unknown; assumptions: unknown; evidence: unknown; creationIdempotencyKey: string }) {
  const snapshot = validated(args.quoteJson, args.assumptions, args.evidence);
  const proposal = await rpc(args.supabase, "create_quote_proposal", {
    p_workspace_id: args.workspaceId, p_actor_email: args.actorEmail, p_expected_row_version: args.expectedRowVersion, p_source_revision_id: args.sourceRevisionId,
    p_proposed_revision_json: snapshot.quoteJson, p_proposed_assumptions_json: snapshot.assumptions, p_proposed_evidence_json: snapshot.evidence, p_creation_idempotency_key: args.creationIdempotencyKey,
  });
  return { proposal };
}

type RejectProposalDiagnostics = { actorUserId: string; workspaceId: string; proposalId: string; sourceComponent: string; requestId: string; browserSessionId: string; route: string };

export async function rejectQuoteProposal(args: { supabase: SupabaseLike; workspaceId: string; proposalId: string; actorEmail: string; expectedRowVersion: number; reason: string; dispositionIdempotencyKey: string; diagnostics?: RejectProposalDiagnostics }) {
  const reason = parseRejectionReason(args.reason);
  const startedAt = Date.now();
  const diagnosticFields = args.diagnostics ?? { actorUserId: "unavailable", workspaceId: args.workspaceId, proposalId: args.proposalId, sourceComponent: "unknown", requestId: "unavailable", browserSessionId: "unavailable", route: "unknown" };
  console.info("[quote-proposal-reject]", JSON.stringify({ event: "quote_proposal_reject_rpc_started", timestamp: new Date().toISOString(), ...diagnosticFields }));
  try {
    const proposal = await rpc(args.supabase, "reject_quote_proposal", {
      p_workspace_id: args.workspaceId, p_proposal_id: args.proposalId, p_actor_email: args.actorEmail, p_expected_row_version: args.expectedRowVersion, p_reason: reason, p_disposition_idempotency_key: args.dispositionIdempotencyKey,
    });
    console.info("[quote-proposal-reject]", JSON.stringify({ event: "quote_proposal_reject_rpc_completed", timestamp: new Date().toISOString(), durationMs: Date.now() - startedAt, ...diagnosticFields }));
    return { proposal };
  } catch (error) {
    console.info("[quote-proposal-reject]", JSON.stringify({ event: "quote_proposal_reject_rpc_failed", timestamp: new Date().toISOString(), durationMs: Date.now() - startedAt, errorCode: error instanceof QuoteProposalPersistenceError ? error.code : "unknown", ...diagnosticFields }));
    throw error;
  }
}

export async function acceptQuoteProposal(args: { supabase: SupabaseLike; workspaceId: string; proposalId: string; actorEmail: string; expectedRowVersion: number; editedQuoteJson?: unknown; editedAssumptions?: unknown; editedEvidence?: unknown; reason?: string | null; dispositionIdempotencyKey: string }) {
  const reason = parseAcceptanceReason(args.reason);
  const supplied = [args.editedQuoteJson, args.editedAssumptions, args.editedEvidence].filter((value) => value !== undefined);
  if (supplied.length > 0 && supplied.length !== 3) throw new QuoteProposalPersistenceError("Complete edited revision, assumptions, and evidence snapshots are required.", "22023");
  let editedQuoteJson = args.editedQuoteJson;
  let editedAssumptions = args.editedAssumptions;
  let editedEvidence = args.editedEvidence;
  if (supplied.length === 3) {
    const snapshot = validated(editedQuoteJson, editedAssumptions, editedEvidence);
    editedQuoteJson = snapshot.quoteJson; editedAssumptions = snapshot.assumptions; editedEvidence = snapshot.evidence;
  }
  const proposal = await rpc(args.supabase, "accept_quote_proposal", {
    p_workspace_id: args.workspaceId, p_proposal_id: args.proposalId, p_actor_email: args.actorEmail, p_expected_row_version: args.expectedRowVersion,
    p_edited_revision_json: editedQuoteJson ?? null, p_edited_assumptions_json: editedAssumptions ?? null, p_edited_evidence_json: editedEvidence ?? null,
    p_reason: reason, p_disposition_idempotency_key: args.dispositionIdempotencyKey,
  });
  return { proposal, acceptedRevisionId: proposal.acceptedRevisionId };
}
