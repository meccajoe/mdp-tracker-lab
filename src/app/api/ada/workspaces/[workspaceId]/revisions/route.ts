import { NextResponse } from "next/server";
import { requireAdaAccess } from "@/lib/ada-server";
import { createAdaQuoteRevision } from "@/lib/ada-quote-revisions";
import { validateAdaQuoteSnapshot } from "@/lib/ada-quote-validation";

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
  try {
    const snapshot = validateAdaQuoteSnapshot(body.quoteJson, body.assumptions, body.evidence);
    const { revision } = await createAdaQuoteRevision({ supabase: access.supabase, workspaceId, actorEmail: access.actorEmail, quoteValue: snapshot.quoteJson, assumptions: snapshot.assumptions, evidence: snapshot.evidence });
    return NextResponse.json({ revision }, { status: 201 });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : "Quote revision is invalid." }, { status: 400 });
  }
}
