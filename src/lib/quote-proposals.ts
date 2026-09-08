export type QuoteProposalStatus = "pending" | "accepted" | "rejected";

export type QuoteProposal<TRevision = unknown> = {
  id: string;
  workspaceId: string;
  sourceRevisionId: string | null;
  expectedRowVersion: number;
  proposedRevision: TRevision;
  createdBy: string;
  createdAt: string;
  status: QuoteProposalStatus;
  disposition?: {
    actor: string;
    disposedAt: string;
    editedRevision: TRevision | null;
  };
};

export type CreateQuoteProposalInput<TRevision> = Omit<QuoteProposal<TRevision>, "status" | "disposition" | "createdBy"> & {
  createdBy: string;
};

type DispositionInput<TRevision> = {
  currentRowVersion: number;
  actor: string;
  disposedAt: string;
  editedRevision?: TRevision;
};

export type QuoteProposalRevisionRequest<TRevision> = {
  workspaceId: string;
  parentRevisionId: string | null;
  createdFrom: "ada_proposal";
  proposalId: string;
  proposedRevision: TRevision;
  idempotencyKey: string;
};

export type QuoteProposalDispositionResult<TRevision> = {
  proposal: QuoteProposal<TRevision>;
  revisionRequest: QuoteProposalRevisionRequest<TRevision> | null;
  events: Array<"proposal_edited" | "proposal_accepted" | "proposal_rejected">;
};

export class QuoteProposalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteProposalConflictError";
  }
}

export class QuoteProposalStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteProposalStateError";
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function requiredText(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must not be blank.`);
  return value.trim();
}

function normalizedEmail(value: string, label: string): string {
  return requiredText(value, label).toLowerCase();
}

function validateExpectedRowVersion(value: number): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error("expected row version must be a positive integer.");
}

export function createQuoteProposal<TRevision>(input: CreateQuoteProposalInput<TRevision>): QuoteProposal<TRevision> {
  const id = requiredText(input.id, "Proposal id");
  const workspaceId = requiredText(input.workspaceId, "Workspace id");
  const sourceRevisionId = input.sourceRevisionId === null ? null : requiredText(input.sourceRevisionId, "Source revision id");
  validateExpectedRowVersion(input.expectedRowVersion);
  const createdAt = requiredText(input.createdAt, "Created at");

  return {
    id,
    workspaceId,
    sourceRevisionId,
    expectedRowVersion: input.expectedRowVersion,
    proposedRevision: clone(input.proposedRevision),
    createdBy: normalizedEmail(input.createdBy, "Created by email"),
    createdAt,
    status: "pending",
  };
}

function beginDisposition<TRevision>(proposal: QuoteProposal<TRevision>, input: DispositionInput<TRevision>): void {
  if (proposal.status !== "pending") throw new QuoteProposalStateError(`Proposal ${proposal.id} is already ${proposal.status}.`);
  if (input.currentRowVersion !== proposal.expectedRowVersion) {
    throw new QuoteProposalConflictError(`Proposal ${proposal.id} expected row version ${proposal.expectedRowVersion}; received ${input.currentRowVersion}.`);
  }
  normalizedEmail(input.actor, "Disposition actor email");
  requiredText(input.disposedAt, "Disposition time");
}

function disposition<TRevision>(proposal: QuoteProposal<TRevision>, input: DispositionInput<TRevision>, status: QuoteProposalStatus): QuoteProposal<TRevision> {
  return {
    ...clone(proposal),
    status,
    disposition: {
      actor: normalizedEmail(input.actor, "Disposition actor email"),
      disposedAt: requiredText(input.disposedAt, "Disposition time"),
      editedRevision: input.editedRevision === undefined ? null : clone(input.editedRevision),
    },
  };
}

export function acceptQuoteProposal<TRevision>(proposal: QuoteProposal<TRevision>, input: DispositionInput<TRevision>): QuoteProposalDispositionResult<TRevision> {
  beginDisposition(proposal, input);
  const acceptedProposal = disposition(proposal, input, "accepted");
  const proposedRevision = input.editedRevision === undefined ? proposal.proposedRevision : input.editedRevision;

  return {
    proposal: acceptedProposal,
    revisionRequest: {
      workspaceId: proposal.workspaceId,
      parentRevisionId: proposal.sourceRevisionId,
      createdFrom: "ada_proposal",
      proposalId: proposal.id,
      proposedRevision: clone(proposedRevision),
      idempotencyKey: `ada-proposal:${proposal.id}`,
    },
    events: input.editedRevision === undefined ? ["proposal_accepted"] : ["proposal_edited", "proposal_accepted"],
  };
}

export function rejectQuoteProposal<TRevision>(proposal: QuoteProposal<TRevision>, input: DispositionInput<TRevision>): QuoteProposalDispositionResult<TRevision> {
  beginDisposition(proposal, input);
  return {
    proposal: disposition(proposal, { ...input, editedRevision: undefined }, "rejected"),
    revisionRequest: null,
    events: ["proposal_rejected"],
  };
}
