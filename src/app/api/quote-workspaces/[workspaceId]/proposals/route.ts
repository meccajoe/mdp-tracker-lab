import { NextResponse } from "next/server";
import { requireAdaWorkspaceAccess } from "@/lib/ada-server";
import { createQuoteProposal, isUuid, listQuoteProposals, parseOptionalSourceRevisionId, parseProposalRequestObject, quoteProposalErrorStatus, QuoteProposalPersistenceError } from "@/lib/quote-proposal-persistence";

const boundedKey = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 200;
const errorResponse = (error: unknown) => {
  const status = quoteProposalErrorStatus(error);
  const message = status === 500 ? "Unable to persist quote proposal." : error instanceof Error ? error.message : "Invalid proposal.";
  return NextResponse.json({ error: message }, { status });
};

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params;
  if (!isUuid(workspaceId)) return NextResponse.json({ error: "Invalid workspaceId." }, { status: 400 });
  const access = await requireAdaWorkspaceAccess(workspaceId); if (!access.ok) return access.response;
  try { return NextResponse.json({ proposals: await listQuoteProposals({ supabase: access.actorSupabase, workspaceId }) }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params;
  if (!isUuid(workspaceId)) return NextResponse.json({ error: "Invalid workspaceId." }, { status: 400 });
  const access = await requireAdaWorkspaceAccess(workspaceId, "edit_draft"); if (!access.ok) return access.response;
  let body: Record<string, unknown>;
  try { body = parseProposalRequestObject(await request.json()); }
  catch (error) { return errorResponse(error instanceof SyntaxError ? new QuoteProposalPersistenceError("Invalid JSON request body.", "22P02") : error); }
  let sourceRevisionId: string | null;
  try { sourceRevisionId = parseOptionalSourceRevisionId(body.sourceRevisionId); }
  catch (error) { return errorResponse(error); }
  if (!Number.isSafeInteger(body.expectedRowVersion) || Number(body.expectedRowVersion) <= 0 || !boundedKey(body.creationIdempotencyKey)) return NextResponse.json({ error: "Invalid proposal creation request." }, { status: 400 });
  try {
    const result = await createQuoteProposal({ supabase: access.actorSupabase, workspaceId, actorEmail: access.actorEmail, expectedRowVersion: body.expectedRowVersion as number, sourceRevisionId, quoteJson: body.quoteJson, assumptions: body.assumptions, evidence: body.evidence, creationIdempotencyKey: (body.creationIdempotencyKey as string).trim() });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
