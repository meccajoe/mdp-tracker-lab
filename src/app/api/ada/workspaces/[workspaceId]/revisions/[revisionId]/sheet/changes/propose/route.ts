import { NextResponse } from "next/server";
import { inferAdaSheetDraft } from "@/lib/ada-sheet-instructions";
import { requireAdaAccess } from "@/lib/ada-server";

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string; revisionId: string }> }) {
  const access = await requireAdaAccess(); if (!access.ok) return access.response;
  const { workspaceId, revisionId } = await context.params; const body = await request.json().catch(() => ({})) as { instruction?: unknown };
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) return NextResponse.json({ error: "Tell Ada what sheet value to change." }, { status: 400 });
  const { data: workspace } = await access.supabase.from("ada_quote_workspaces").select("id").eq("id", workspaceId).eq("created_by_email", access.actorEmail).maybeSingle();
  if (!workspace) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  const [{ data: sheet }, { data: revision, error: revisionError }] = await Promise.all([
    access.supabase.from("ada_quote_sheets").select("id").eq("workspace_id", workspaceId).eq("revision_id", revisionId).maybeSingle(),
    access.supabase.from("ada_quote_revisions").select("quote_json").eq("id", revisionId).eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (revisionError) return NextResponse.json({ error: revisionError.message }, { status: 500 });
  if (!sheet || !revision) return NextResponse.json({ error: "Working sheet or quote revision not found." }, { status: 404 });
  const lineItems = ((revision.quote_json as { lineItems?: unknown[] }).lineItems ?? []);
  const draft = inferAdaSheetDraft(instruction, lineItems.length);
  if (!draft) return NextResponse.json({ error: "Ada needs a specific A1 range/value or margin-factor instruction before it can stage a sheet change." }, { status: 400 });
  const { data, error } = await access.supabase.from("ada_quote_sheet_changes").insert({ sheet_id: sheet.id, workspace_id: workspaceId, revision_id: revisionId, range_a1: draft.rangeA1, values_json: draft.values, status: "draft", created_by_email: access.actorEmail }).select("id, range_a1, values_json, status, created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ change: data, instruction }, { status: 201 });
}
