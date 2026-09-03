import { NextResponse } from "next/server";
import { requireAdaWorkspaceAccess } from "@/lib/ada-server";

async function ownedSheet(access: any, workspaceId: string, revisionId: string) {
  const { data: revision, error: revisionError } = await access.supabase
    .from("ada_quote_revisions")
    .select("id")
    .eq("id", revisionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (revisionError || !revision) return { data: null };
  return access.supabase.from("ada_quote_sheets").select("id").eq("workspace_id", workspaceId).eq("revision_id", revisionId).maybeSingle();
}

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string; revisionId: string }> }) {
  const { workspaceId, revisionId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId); if (!access.ok) return access.response;
  const { data: sheet } = await ownedSheet(access, workspaceId, revisionId);
  if (!sheet) return NextResponse.json({ error: "Working sheet not found." }, { status: 404 });
  const { data, error } = await access.supabase.from("ada_quote_sheet_changes").select("id, range_a1, values_json, status, created_at, applied_at").eq("sheet_id", sheet.id).eq("workspace_id", workspaceId).eq("revision_id", revisionId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ changes: data ?? [] });
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string; revisionId: string }> }) {
  const { workspaceId, revisionId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId, "edit_draft"); if (!access.ok) return access.response;
  const body = await request.json().catch(() => ({})) as { rangeA1?: unknown; values?: unknown };
  const rangeA1 = typeof body.rangeA1 === "string" ? body.rangeA1.trim() : "";
  const values = Array.isArray(body.values) ? body.values : null;
  if (!rangeA1 || !values) return NextResponse.json({ error: "A1 range and values are required." }, { status: 400 });
  const { data: sheet } = await ownedSheet(access, workspaceId, revisionId);
  if (!sheet) return NextResponse.json({ error: "Working sheet not found." }, { status: 404 });
  const { data, error } = await access.supabase.from("ada_quote_sheet_changes").insert({ sheet_id: sheet.id, workspace_id: workspaceId, revision_id: revisionId, range_a1: rangeA1, values_json: values, status: "draft", created_by_email: access.actorEmail }).select("id, range_a1, values_json, status, created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ change: data }, { status: 201 });
}
