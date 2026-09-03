import { NextResponse } from "next/server";
import { generateAdaQuote } from "@/lib/ada-quote-generation";
import { retrieveAdaIntelligence } from "@/lib/ada-intelligence/gateway";
import { createAdaQuoteRevision } from "@/lib/ada-quote-revisions";
import { requireAdaWorkspaceAccess } from "@/lib/ada-server";

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId, "edit_draft");
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => ({})) as { instruction?: unknown };
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) return NextResponse.json({ error: "Tell Ada what to revise." }, { status: 400 });
  const { data: workspace } = await access.supabase.from("ada_quote_workspaces").select("id, tracker_project_id").eq("id", workspaceId).maybeSingle();
  if (!workspace) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  const { data: current } = await access.supabase.from("ada_quote_revisions").select("revision_number, quote_json, assumptions_json, evidence_json").eq("workspace_id", workspaceId).order("revision_number", { ascending: false }).limit(1).maybeSingle();
  if (!current) return NextResponse.json({ error: "Generate an initial quote before revising it." }, { status: 400 });
  const intelligence = await retrieveAdaIntelligence(access.supabase, instruction, { actorRole: access.actorRole, pmInitials: access.pmInitials, currentTrackerProjectId: workspace.tracker_project_id });
  try {
    const quote = await generateAdaQuote({ messages: [{ content: instruction }], assets: [], intelligence: intelligence.evidence, existingQuote: current.quote_json, instruction });
    const { revision } = await createAdaQuoteRevision({ supabase: access.actorSupabase, workspaceId, actorEmail: access.actorEmail, quoteValue: { lineItems: quote.lineItems }, assumptions: quote.assumptions, evidence: quote.evidence });
    return NextResponse.json({ revision, limitations: intelligence.limitations }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ada could not revise the quote." }, { status: 500 }); }
}
