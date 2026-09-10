import { NextResponse } from "next/server";
import { requireAdaWorkspaceAccess } from "@/lib/ada-server";
import { isUuid, rejectQuoteProposal, parseProposalRequestObject, parseRejectionReason, QuoteProposalPersistenceError, quoteProposalErrorStatus } from "@/lib/quote-proposal-persistence";

const boundedKey = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 200;
const boundedDiagnosticHeader = (value: string | null, fallback: string) => value && value.length <= 200 ? value : fallback;
const errorResponse = (error: unknown) => { const status = quoteProposalErrorStatus(error); const message = status === 500 ? "Unable to persist quote proposal." : error instanceof Error ? error.message : "Invalid proposal."; return NextResponse.json({ error: message }, { status }); };
const logRejectInvocation = (event: string, fields: Record<string, unknown>) => console.info("[quote-proposal-reject]", JSON.stringify({ event, timestamp: new Date().toISOString(), ...fields }));

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string; proposalId: string }> }) {
  const { workspaceId, proposalId } = await context.params;
  if (!isUuid(workspaceId) || !isUuid(proposalId)) return NextResponse.json({ error: "Invalid workspaceId or proposalId." }, { status: 400 });
  const access = await requireAdaWorkspaceAccess(workspaceId, "edit_draft"); if (!access.ok) return access.response;
  const requestId = boundedDiagnosticHeader(request.headers.get("x-mdp-request-id"), crypto.randomUUID());
  const browserSessionId = boundedDiagnosticHeader(request.headers.get("x-mdp-browser-session-id"), "unavailable");
  const sourceComponent = boundedDiagnosticHeader(request.headers.get("x-mdp-source"), "unknown");
  const diagnostics = { actorUserId: access.actorId, workspaceId, proposalId, sourceComponent, requestId, browserSessionId, route: new URL(request.url).pathname };
  logRejectInvocation("quote_proposal_reject_api_received", diagnostics);
  let body: Record<string, unknown>;
  try { body = parseProposalRequestObject(await request.json()); }
  catch (error) { return errorResponse(error instanceof SyntaxError ? new QuoteProposalPersistenceError("Invalid JSON request body.", "22P02") : error); }
  if (!Number.isSafeInteger(body.expectedRowVersion) || Number(body.expectedRowVersion) <= 0 || !boundedKey(body.dispositionIdempotencyKey)) return NextResponse.json({ error: "Invalid proposal rejection request." }, { status: 400 });
  try {
    const normalizedReason = parseRejectionReason(body.reason);
    const result = await rejectQuoteProposal({ supabase: access.actorSupabase, workspaceId, proposalId, actorEmail: access.actorEmail, expectedRowVersion: body.expectedRowVersion as number, reason: normalizedReason, dispositionIdempotencyKey: (body.dispositionIdempotencyKey as string).trim(), diagnostics });
    logRejectInvocation("quote_proposal_reject_api_completed", diagnostics);
    return NextResponse.json(result);
  } catch (error) {
    logRejectInvocation("quote_proposal_reject_api_failed", { ...diagnostics, errorCode: error instanceof QuoteProposalPersistenceError ? error.code : "unknown" });
    return errorResponse(error);
  }
}
