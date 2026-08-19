import { NextResponse } from "next/server";
import { readAdaGoogleSheetRange } from "@/lib/ada-google-sheets";
import { quoteRevisionToSheetValues } from "@/lib/ada-quote-workbook";
import { requireAdaAccess } from "@/lib/ada-server";

function comparable(value: unknown) { return String(value ?? "").trim(); }

export async function POST(_request: Request, context: { params: Promise<{ workspaceId: string; revisionId: string }> }) {
  const access = await requireAdaAccess(); if (!access.ok) return access.response;
  const { workspaceId, revisionId } = await context.params;
  const [{ data: workspace }, { data: sheet }, { data: revision, error: revisionError }] = await Promise.all([
    access.supabase.from("ada_quote_workspaces").select("id, title").eq("id", workspaceId).eq("created_by_email", access.actorEmail).maybeSingle(),
    access.supabase.from("ada_quote_sheets").select("id, spreadsheet_id").eq("workspace_id", workspaceId).eq("revision_id", revisionId).maybeSingle(),
    access.supabase.from("ada_quote_revisions").select("quote_json, revision_number, internal_cost, sell_price, margin_pct, assumptions_json").eq("id", revisionId).eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (revisionError) return NextResponse.json({ error: revisionError.message }, { status: 500 });
  if (!workspace || !sheet || !revision) return NextResponse.json({ error: "Working sheet or quote revision not found." }, { status: 404 });
  try {
    const expected = quoteRevisionToSheetValues(revision as any, workspace.title);
    const actual = await readAdaGoogleSheetRange({ spreadsheetId: sheet.spreadsheet_id, rangeA1: "Sheet1!A1:G200" });
    const conflicts: Array<{ cell: string; expected: string; actual: string }> = [];
    expected.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
      if (comparable(value) && comparable(value) !== comparable(actual[rowIndex]?.[columnIndex])) conflicts.push({ cell: `Sheet1!${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`, expected: comparable(value), actual: comparable(actual[rowIndex]?.[columnIndex]) });
    }));
    const now = new Date().toISOString(); const syncStatus = conflicts.length ? "needs_review" : "synced";
    const { error } = await access.supabase.from("ada_quote_sheets").update({ sync_status: syncStatus, last_sync_at: now, sync_conflicts_json: conflicts, updated_at: now }).eq("id", sheet.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ syncStatus, lastSyncAt: now, conflicts });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ada could not check the working sheet." }, { status: 500 }); }
}
