import { NextResponse } from "next/server";
import { createPrivateAdaGoogleSheet } from "@/lib/ada-google-sheets";
import { quoteRevisionToSheetValues } from "@/lib/ada-quote-workbook";
import { requireAdaWorkspaceAccess } from "@/lib/ada-server";

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string; revisionId: string }> }) {
  const { workspaceId, revisionId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId); if (!access.ok) return access.response;
  const { data: sheet, error } = await access.supabase.from("ada_quote_sheets").select("spreadsheet_id, spreadsheet_url, sync_status, updated_at, last_sync_at, sync_conflicts_json").eq("workspace_id", workspaceId).eq("revision_id", revisionId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sheet: sheet ? { spreadsheetId: sheet.spreadsheet_id, url: sheet.spreadsheet_url, syncStatus: sheet.sync_status, updatedAt: sheet.updated_at, lastSyncAt: sheet.last_sync_at, conflicts: sheet.sync_conflicts_json } : null });
}

export async function POST(_request: Request, context: { params: Promise<{ workspaceId: string; revisionId: string }> }) {
  const { workspaceId, revisionId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId, "edit_draft"); if (!access.ok) return access.response;
  const { data: workspace } = await access.supabase.from("ada_quote_workspaces").select("id, title").eq("id", workspaceId).maybeSingle();
  if (!workspace) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  const { data: existing, error: existingError } = await access.supabase.from("ada_quote_sheets").select("spreadsheet_id, spreadsheet_url, sync_status").eq("revision_id", revisionId).eq("workspace_id", workspaceId).maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existing) return NextResponse.json({ sheet: { spreadsheetId: existing.spreadsheet_id, url: existing.spreadsheet_url, syncStatus: existing.sync_status }, reused: true });
  const { data: revision, error } = await access.supabase.from("ada_quote_revisions").select("revision_number, quote_json, internal_cost, sell_price, margin_pct, assumptions_json").eq("id", revisionId).eq("workspace_id", workspaceId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!revision) return NextResponse.json({ error: "Quote revision not found." }, { status: 404 });
  try {
    const sheet = await createPrivateAdaGoogleSheet({ title: `${workspace.title} — Ada Quote R${revision.revision_number}`, values: quoteRevisionToSheetValues(revision as any, workspace.title) });
    const { error: insertError } = await access.supabase.from("ada_quote_sheets").insert({ workspace_id: workspaceId, revision_id: revisionId, spreadsheet_id: sheet.spreadsheetId, spreadsheet_url: sheet.url, created_by_email: access.actorEmail });
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    return NextResponse.json({ sheet: { ...sheet, syncStatus: "created" }, reused: false });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ada could not create the working sheet." }, { status: 500 }); }
}
