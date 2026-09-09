export type ProposalSnapshot = {
  quoteJson: { lineItems: Array<Record<string, any>> };
  assumptions: string[];
  evidence: unknown[];
};

export type ProposalDispositionTarget = {
  id: string;
  expectedRowVersion: number;
};

export const MAX_PROPOSAL_REASON_CODE_POINTS = 2_000;

export type ProposalSnapshotSource = ProposalDispositionTarget & {
  proposedRevision: ProposalSnapshot["quoteJson"];
  proposedAssumptions: string[];
  proposedEvidence: unknown[];
};

export function proposalDispositionIdempotencyKey(
  proposalId: string,
  disposition: "accept" | "reject",
) {
  return `quote-proposal:${proposalId}:${disposition}`;
}

export function cloneProposalSnapshot(proposal: ProposalSnapshotSource): ProposalSnapshot {
  return structuredClone({
    quoteJson: proposal.proposedRevision,
    assumptions: proposal.proposedAssumptions,
    evidence: proposal.proposedEvidence,
  });
}

function normalizeMoneyValue(value: unknown) {
  if (typeof value === "string" && !value.trim()) {
    throw new Error("Every edited cost and sell price must be a finite, non-negative number.");
  }
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error("Every edited cost and sell price must be a finite, non-negative number.");
  }
  return numericValue;
}

export function normalizeEditedProposalSnapshot(snapshot: ProposalSnapshot): ProposalSnapshot {
  const normalized = structuredClone(snapshot);
  normalized.quoteJson.lineItems = normalized.quoteJson.lineItems.map((line) => ({
    ...line,
    internalCost: normalizeMoneyValue(line.internalCost),
    clientPrice: normalizeMoneyValue(line.clientPrice),
  }));
  return normalized;
}

export type ProposalEvidenceDescriptor = {
  label: string;
  assetId: string | null;
  pageNumber: number | null;
};

function descriptorFromSourceId(sourceId: string, label: string, pageNumber: number | null): ProposalEvidenceDescriptor {
  const assetMatch = sourceId.match(/^asset:([^:]+)(?::page:(\d+))?$/);
  const parsedPage = assetMatch?.[2] ? Number(assetMatch[2]) : null;
  return {
    label,
    assetId: assetMatch?.[1] ?? null,
    pageNumber: pageNumber ?? (parsedPage && Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : null),
  };
}

export function describeProposalEvidence(value: unknown, index: number): ProposalEvidenceDescriptor {
  if (typeof value === "string") {
    const sourceId = value.trim();
    return descriptorFromSourceId(sourceId, sourceId || `Evidence ${index + 1}`, null);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { label: `Evidence ${index + 1}`, assetId: null, pageNumber: null };
  }

  const entry = value as Record<string, unknown>;
  const sourceId = typeof entry.sourceId === "string" ? entry.sourceId.trim() : "";
  const labelValue = [entry.label, entry.title, sourceId].find((candidate) => typeof candidate === "string" && candidate.trim());
  const rawPage = entry.pageNumber ?? entry.page;
  return descriptorFromSourceId(
    sourceId,
    typeof labelValue === "string" ? labelValue.trim() : `Evidence ${index + 1}`,
    typeof rawPage === "number" && Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : null,
  );
}

export function buildProposalAcceptanceRequest(
  proposal: ProposalDispositionTarget,
  editedSnapshot?: ProposalSnapshot,
) {
  const base = {
    expectedRowVersion: proposal.expectedRowVersion,
    dispositionIdempotencyKey: proposalDispositionIdempotencyKey(proposal.id, "accept"),
  };

  if (!editedSnapshot) return base;

  return {
    ...base,
    quoteJson: editedSnapshot.quoteJson,
    assumptions: editedSnapshot.assumptions,
    evidence: editedSnapshot.evidence,
  };
}

export function buildProposalRejectionRequest(
  proposal: ProposalDispositionTarget,
  reason: string,
) {
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new Error("A rejection reason is required.");
  if (Array.from(normalizedReason).length > MAX_PROPOSAL_REASON_CODE_POINTS) {
    throw new Error("A rejection reason must be 2,000 characters or fewer.");
  }
  return {
    expectedRowVersion: proposal.expectedRowVersion,
    dispositionIdempotencyKey: proposalDispositionIdempotencyKey(proposal.id, "reject"),
    reason: normalizedReason,
  };
}
