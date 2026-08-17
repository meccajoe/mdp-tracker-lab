import { NextResponse } from "next/server";
import { requireAdaAccess } from "@/lib/ada-server";

async function ownedWorkspace(access: any, workspaceId: string) {
  return access.supabase.from("ada_quote_workspaces").select("id").eq("id", workspaceId).eq("created_by_email", access.actorEmail).maybeSingle();
}

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const access = await requireAdaAccess(); if (!access.ok) return access.response;
  const { workspaceId } = await context.params; const { data: workspace } = await ownedWorkspace(access, workspaceId);
  if (!workspace) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  const { data, error } = await access.supabase.from("ada_quote_revisions").select("id, revision_number, quote_json, internal_cost, sell_price, margin_pct, assumptions_json, evidence_json, created_at").eq("workspace_id", workspaceId).order("revision_number", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ revisions: data ?? [] });
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const access = await requireAdaAccess(); if (!access.ok) return access.response;
  const { workspaceId } = await context.params; const { data: workspace } = await ownedWorkspace(access, workspaceId);
  if (!workspace) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const internalCost = Number(body.internalCost), sellPrice = Number(body.sellPrice), marginPct = Number(body.marginPct);
  if (![internalCost, sellPrice, marginPct].every(Number.isFinite) || internalCost < 0 || sellPrice < 0) return NextResponse.json({ error: "Quote totals must be valid non-negative numbers." }, { status: 400 });
  const { data: latest } = await access.supabase.from("ada_quote_revisions").select("revision_number").eq("workspace_id", workspaceId).order("revision_number", { ascending: false }).limit(1).maybeSingle();
  const revision_number = (latest?.revision_number ?? 0) + 1;
  const { data, error } = await access.supabase.from("ada_quote_revisions").insert({ workspace_id: workspaceId, revision_number, quote_json: body.quoteJson ?? { lineItems: [] }, internal_cost: internalCost, sell_price: sellPrice, margin_pct: marginPct, assumptions_json: Array.isArray(body.assumptions) ? body.assumptions : [], evidence_json: Array.isArray(body.evidence) ? body.evidence : [], created_by_email: access.actorEmail }).select("id, revision_number, quote_json, internal_cost, sell_price, margin_pct, assumptions_json, evidence_json, created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ revision: data }, { status: 201 });
}
