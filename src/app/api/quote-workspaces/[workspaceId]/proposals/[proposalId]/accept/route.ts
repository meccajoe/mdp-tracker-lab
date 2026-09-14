import { NextResponse } from "next/server";
import { requireQuoteProductWorkspaceAccess } from "@/lib/ada-server";
import { acceptQuoteProposal, isUuid, parseAcceptanceReason, parseProposalRequestObject, QuoteProposalPersistenceError, quoteProposalErrorStatus } from "@/lib/quote-proposal-persistence";

const boundedKey = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 200;
const errorResponse = (error: unknown) => { const status = quoteProposalErrorStatus(error); const message = status === 500 ? "Unable to persist quote proposal." : error instanceof Error ? error.message : "Invalid proposal."; return NextResponse.json({ error: message }, { status }); };

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string; proposalId: string }> }) {
  const { workspaceId, proposalId } = await context.params;
  if (!isUuid(workspaceId) || !isUuid(proposalId)) return NextResponse.json({ error: "Invalid workspaceId or proposalId." }, { status: 400 });
  const access = await requireQuoteProductWorkspaceAccess(workspaceId, "edit_draft"); if (!access.ok) return access.response;
  let body: Record<string, unknown>;
  try { body = parseProposalRequestObject(await request.json()); }
  catch (error) { return errorResponse(error instanceof SyntaxError ? new QuoteProposalPersistenceError("Invalid JSON request body.", "22P02") : error); }
  if (!Number.isSafeInteger(body.expectedRowVersion) || Number(body.expectedRowVersion) <= 0 || !boundedKey(body.dispositionIdempotencyKey)) return NextResponse.json({ error: "Invalid proposal acceptance request." }, { status: 400 });
  const edited = [body.quoteJson, body.assumptions, body.evidence].filter((value) => value !== undefined);
  if (edited.length !== 0 && edited.length !== 3) return NextResponse.json({ error: "Complete edited acceptance requires quoteJson, assumptions, and evidence together." }, { status: 400 });
  try {
    const normalizedReason = parseAcceptanceReason(body.reason);
    const result = await acceptQuoteProposal({ supabase: access.actorSupabase, workspaceId, proposalId, actorEmail: access.actorEmail, expectedRowVersion: body.expectedRowVersion as number, editedQuoteJson: body.quoteJson, editedAssumptions: body.assumptions, editedEvidence: body.evidence, reason: normalizedReason, dispositionIdempotencyKey: (body.dispositionIdempotencyKey as string).trim() });
    return NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}
