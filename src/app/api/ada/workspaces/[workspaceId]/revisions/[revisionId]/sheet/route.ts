import { NextResponse } from "next/server";
import { createPrivateAdaGoogleSheet } from "@/lib/ada-google-sheets";
import { quoteRevisionToSheetValues } from "@/lib/ada-quote-workbook";
import { requireAdaAccess } from "@/lib/ada-server";

export async function POST(_request: Request, context: { params: Promise<{ workspaceId: string; revisionId: string }> }) {
  const access = await requireAdaAccess(); if (!access.ok) return access.response;
  const { workspaceId, revisionId } = await context.params;
  const { data: workspace } = await access.supabase.from("ada_quote_workspaces").select("id, title").eq("id", workspaceId).eq("created_by_email", access.actorEmail).maybeSingle();
  if (!workspace) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  const { data: revision, error } = await access.supabase.from("ada_quote_revisions").select("revision_number, quote_json, internal_cost, sell_price, margin_pct, assumptions_json").eq("id", revisionId).eq("workspace_id", workspaceId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!revision) return NextResponse.json({ error: "Quote revision not found." }, { status: 404 });
  try {
    const sheet = await createPrivateAdaGoogleSheet({ title: `${workspace.title} — Ada Quote R${revision.revision_number}`, values: quoteRevisionToSheetValues(revision as any, workspace.title) });
    return NextResponse.json({ sheet });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ada could not create the working sheet." }, { status: 500 }); }
}
