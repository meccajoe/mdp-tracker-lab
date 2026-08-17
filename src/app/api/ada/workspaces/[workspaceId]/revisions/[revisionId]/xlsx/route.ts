import { NextResponse } from "next/server";
import { buildAdaQuoteWorkbook } from "@/lib/ada-quote-workbook";
import { requireAdaAccess } from "@/lib/ada-server";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string; revisionId: string }> }) {
  const access = await requireAdaAccess(); if (!access.ok) return access.response;
  const { workspaceId, revisionId } = await context.params;
  const { data: workspace } = await access.supabase.from("ada_quote_workspaces").select("id, title").eq("id", workspaceId).eq("created_by_email", access.actorEmail).maybeSingle();
  if (!workspace) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  const { data: revision, error } = await access.supabase.from("ada_quote_revisions").select("revision_number, quote_json, internal_cost, sell_price, margin_pct, assumptions_json").eq("id", revisionId).eq("workspace_id", workspaceId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!revision) return NextResponse.json({ error: "Quote revision not found." }, { status: 404 });
  const xlsx = buildAdaQuoteWorkbook(revision as any, workspace.title);
  return new NextResponse(xlsx, { headers: { "Content-Type": XLSX_MIME, "Content-Disposition": `attachment; filename="${workspace.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "ada-quote"}-r${revision.revision_number}.xlsx"` } });
}
