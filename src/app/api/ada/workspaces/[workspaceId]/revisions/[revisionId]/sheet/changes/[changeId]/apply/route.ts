import { NextResponse } from "next/server";
import { applyAdaGoogleSheetRangeChange } from "@/lib/ada-google-sheets";
import { requireAdaWorkspaceAccess } from "@/lib/ada-server";

export async function POST(_request: Request, context: { params: Promise<{ workspaceId: string; revisionId: string; changeId: string }> }) {
  const { workspaceId, revisionId, changeId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId, "approve_change"); if (!access.ok) return access.response;
  const { data: revision } = await access.supabase.from("ada_quote_revisions").select("id").eq("id", revisionId).eq("workspace_id", workspaceId).maybeSingle();
  if (!revision) return NextResponse.json({ error: "Quote revision not found." }, { status: 404 });
  const { data: sheet } = await access.supabase.from("ada_quote_sheets").select("id, spreadsheet_id").eq("workspace_id", workspaceId).eq("revision_id", revisionId).maybeSingle();
  if (!sheet) return NextResponse.json({ error: "Working sheet not found." }, { status: 404 });
  const { data: change, error } = await access.supabase.from("ada_quote_sheet_changes").select("id, range_a1, values_json, status").eq("id", changeId).eq("sheet_id", sheet.id).eq("workspace_id", workspaceId).eq("revision_id", revisionId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!change) return NextResponse.json({ error: "Sheet change not found." }, { status: 404 });
  if (change.status !== "draft") return NextResponse.json({ error: "Only draft changes can be applied." }, { status: 409 });
  try {
    await applyAdaGoogleSheetRangeChange({ spreadsheetId: sheet.spreadsheet_id, rangeA1: change.range_a1, values: change.values_json as unknown[][] });
    const appliedAt = new Date().toISOString();
    await access.supabase.from("ada_quote_sheet_changes").update({ status: "applied", applied_at: appliedAt }).eq("id", change.id).eq("workspace_id", workspaceId).eq("revision_id", revisionId);
    await access.supabase.from("ada_quote_sheets").update({ sync_status: "synced", updated_at: appliedAt }).eq("id", sheet.id).eq("workspace_id", workspaceId).eq("revision_id", revisionId);
    return NextResponse.json({ appliedChangeId: change.id, status: "applied" });
  } catch (error) { await access.supabase.from("ada_quote_sheet_changes").update({ status: "failed" }).eq("id", change.id).eq("workspace_id", workspaceId).eq("revision_id", revisionId); return NextResponse.json({ error: error instanceof Error ? error.message : "Ada could not apply the sheet change." }, { status: 500 }); }
}
