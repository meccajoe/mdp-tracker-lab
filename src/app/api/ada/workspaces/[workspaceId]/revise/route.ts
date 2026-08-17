import { NextResponse } from "next/server";
import { generateAdaQuote } from "@/lib/ada-quote-generation";
import { retrieveAdaIntelligence } from "@/lib/ada-intelligence/gateway";
import { requireAdaAccess } from "@/lib/ada-server";

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const access = await requireAdaAccess(); if (!access.ok) return access.response;
  const { workspaceId } = await context.params; const body = await request.json().catch(() => ({})) as { instruction?: unknown };
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) return NextResponse.json({ error: "Tell Ada what to revise." }, { status: 400 });
  const { data: workspace } = await access.supabase.from("ada_quote_workspaces").select("id").eq("id", workspaceId).eq("created_by_email", access.actorEmail).maybeSingle();
  if (!workspace) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  const { data: current } = await access.supabase.from("ada_quote_revisions").select("revision_number, quote_json, assumptions_json, evidence_json").eq("workspace_id", workspaceId).order("revision_number", { ascending: false }).limit(1).maybeSingle();
  if (!current) return NextResponse.json({ error: "Generate an initial quote before revising it." }, { status: 400 });
  const intelligence = await retrieveAdaIntelligence(access.supabase, instruction);
  try {
    const quote = await generateAdaQuote({ messages: [{ content: instruction }], assets: [], intelligence: intelligence.evidence, existingQuote: current.quote_json, instruction });
    const internalCost = quote.lineItems.reduce((sum, line) => sum + line.internalCost, 0); const sellPrice = quote.lineItems.reduce((sum, line) => sum + line.clientPrice, 0); const marginPct = sellPrice ? ((sellPrice - internalCost) / sellPrice) * 100 : 0;
    const { data, error } = await access.supabase.from("ada_quote_revisions").insert({ workspace_id: workspaceId, revision_number: current.revision_number + 1, quote_json: { lineItems: quote.lineItems }, internal_cost: internalCost, sell_price: sellPrice, margin_pct: marginPct, assumptions_json: quote.assumptions, evidence_json: quote.evidence, created_by_email: access.actorEmail }).select("id, revision_number, quote_json, internal_cost, sell_price, margin_pct, assumptions_json, evidence_json, created_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ revision: data, limitations: intelligence.limitations }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ada could not revise the quote." }, { status: 500 }); }
}
