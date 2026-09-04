import { NextResponse } from "next/server";
import { generateAdaQuote } from "@/lib/ada-quote-generation";
import { retrieveAdaIntelligence } from "@/lib/ada-intelligence/gateway";
import { createAdaQuoteRevision } from "@/lib/ada-quote-revisions";
import { requireAdaWorkspaceAccess } from "@/lib/ada-server";

export async function POST(_request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId, "edit_draft"); if (!access.ok) return access.response;
  const { data: workspace } = await access.supabase.from("ada_quote_workspaces").select("id, tracker_project_id").eq("id", workspaceId).maybeSingle();
  if (!workspace) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  const [messagesResult, assetsResult] = await Promise.all([
    access.supabase.from("ada_quote_messages").select("content").eq("workspace_id", workspaceId).order("created_at"),
    access.supabase.from("ada_quote_assets").select("id, original_name, analysis_json, analysis_status").eq("workspace_id", workspaceId).eq("analysis_status", "ready").is("archived_at", null),
  ]);
  if (messagesResult.error || assetsResult.error) return NextResponse.json({ error: messagesResult.error?.message ?? assetsResult.error?.message }, { status: 500 });
  const query = (messagesResult.data ?? []).map((message) => message.content).join(" ").slice(-500);
  const intelligence = await retrieveAdaIntelligence(access.supabase, query, { actorRole: access.actorRole, pmInitials: access.pmInitials, currentTrackerProjectId: workspace.tracker_project_id });
  try {
    const quote = await generateAdaQuote({ messages: messagesResult.data ?? [], assets: assetsResult.data ?? [], intelligence: intelligence.evidence });
    const { revision } = await createAdaQuoteRevision({ supabase: access.actorSupabase, workspaceId, actorEmail: access.actorEmail, quoteValue: { lineItems: quote.lineItems }, assumptions: quote.assumptions, evidence: quote.evidence });
    return NextResponse.json({ revision, limitations: intelligence.limitations }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ada could not generate a quote." }, { status: 500 }); }
}
