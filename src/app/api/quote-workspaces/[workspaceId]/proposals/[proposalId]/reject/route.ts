import { NextResponse } from "next/server";
import { requireAdaWorkspaceAccess } from "@/lib/ada-server";
import { isUuid, rejectQuoteProposal, parseProposalRequestObject, parseRejectionReason, QuoteProposalPersistenceError, quoteProposalErrorStatus } from "@/lib/quote-proposal-persistence";

const boundedKey = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 200;
const errorResponse = (error: unknown) => { const status = quoteProposalErrorStatus(error); const message = status === 500 ? "Unable to persist quote proposal." : error instanceof Error ? error.message : "Invalid proposal."; return NextResponse.json({ error: message }, { status }); };

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string; proposalId: string }> }) {
  const { workspaceId, proposalId } = await context.params;
  if (!isUuid(workspaceId) || !isUuid(proposalId)) return NextResponse.json({ error: "Invalid workspaceId or proposalId." }, { status: 400 });
  const access = await requireAdaWorkspaceAccess(workspaceId, "edit_draft"); if (!access.ok) return access.response;
  let body: Record<string, unknown>;
  try { body = parseProposalRequestObject(await request.json()); }
  catch (error) { return errorResponse(error instanceof SyntaxError ? new QuoteProposalPersistenceError("Invalid JSON request body.", "22P02") : error); }
  if (!Number.isSafeInteger(body.expectedRowVersion) || Number(body.expectedRowVersion) <= 0 || !boundedKey(body.dispositionIdempotencyKey)) return NextResponse.json({ error: "Invalid proposal rejection request." }, { status: 400 });
  try {
    const normalizedReason = parseRejectionReason(body.reason);
    const result = await rejectQuoteProposal({ supabase: access.actorSupabase, workspaceId, proposalId, actorEmail: access.actorEmail, expectedRowVersion: body.expectedRowVersion as number, reason: normalizedReason, dispositionIdempotencyKey: (body.dispositionIdempotencyKey as string).trim() });
    return NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}
