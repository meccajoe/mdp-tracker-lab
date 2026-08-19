import { NextResponse } from "next/server";
import { generateAdaQuote } from "@/lib/ada-quote-generation";
import { retrieveAdaIntelligence } from "@/lib/ada-intelligence/gateway";
import { requireAdaAccess } from "@/lib/ada-server";

export async function POST(_request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const access = await requireAdaAccess(); if (!access.ok) return access.response;
  const { workspaceId } = await context.params;
  const { data: workspace } = await access.supabase.from("ada_quote_workspaces").select("id, tracker_project_id").eq("id", workspaceId).eq("created_by_email", access.actorEmail).maybeSingle();
  if (!workspace) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  const [messagesResult, assetsResult] = await Promise.all([
    access.supabase.from("ada_quote_messages").select("content").eq("workspace_id", workspaceId).order("created_at"),
    access.supabase.from("ada_quote_assets").select("id, original_name, analysis_json, analysis_status").eq("workspace_id", workspaceId).eq("analysis_status", "ready"),
  ]);
  if (messagesResult.error || assetsResult.error) return NextResponse.json({ error: messagesResult.error?.message ?? assetsResult.error?.message }, { status: 500 });
  const query = (messagesResult.data ?? []).map((message) => message.content).join(" ").slice(-500);
  const intelligence = await retrieveAdaIntelligence(access.supabase, query, { actorRole: access.actorRole, pmInitials: access.pmInitials, currentTrackerProjectId: workspace.tracker_project_id });
  try {
    const quote = await generateAdaQuote({ messages: messagesResult.data ?? [], assets: assetsResult.data ?? [], intelligence: intelligence.evidence });
    const internalCost = quote.lineItems.reduce((sum, line) => sum + line.internalCost, 0);
    const sellPrice = quote.lineItems.reduce((sum, line) => sum + line.clientPrice, 0);
    const marginPct = sellPrice > 0 ? ((sellPrice - internalCost) / sellPrice) * 100 : 0;
    const { data: latest } = await access.supabase.from("ada_quote_revisions").select("revision_number").eq("workspace_id", workspaceId).order("revision_number", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await access.supabase.from("ada_quote_revisions").insert({ workspace_id: workspaceId, revision_number: (latest?.revision_number ?? 0) + 1, quote_json: { lineItems: quote.lineItems }, internal_cost: internalCost, sell_price: sellPrice, margin_pct: marginPct, assumptions_json: quote.assumptions, evidence_json: quote.evidence, created_by_email: access.actorEmail }).select("id, revision_number, quote_json, internal_cost, sell_price, margin_pct, assumptions_json, evidence_json, created_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ revision: data, limitations: intelligence.limitations }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ada could not generate a quote." }, { status: 500 }); }
}
