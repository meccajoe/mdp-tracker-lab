import { NextResponse } from "next/server";
import { requireAdaAccess } from "@/lib/ada-server";

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string; revisionId: string }> }) {
  const access = await requireAdaAccess(); if (!access.ok) return access.response;
  const { workspaceId, revisionId } = await context.params;
  const [{ data: workspace }, { data: revision }] = await Promise.all([
    access.supabase.from("ada_quote_workspaces").select("id, title, client_name, tracker_project_id, hubspot_deal_id, status, accepted_revision_id, accepted_at").eq("id", workspaceId).eq("created_by_email", access.actorEmail).maybeSingle(),
    access.supabase.from("ada_quote_revisions").select("id, revision_number, sell_price, margin_pct").eq("id", revisionId).eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (!workspace || !revision) return NextResponse.json({ error: "Ada quote revision not found." }, { status: 404 });
  if (workspace.status !== "accepted" || workspace.accepted_revision_id !== revisionId) return NextResponse.json({ error: "Accept this exact revision before previewing a handoff." }, { status: 409 });
  const proposedActions = [
    workspace.tracker_project_id ? `Link accepted Ada revision ${revision.revision_number} to existing Tracker project ${workspace.tracker_project_id}.` : "Create or link a Tracker project from this accepted Ada revision.",
    workspace.hubspot_deal_id ? `Attach accepted quote summary to HubSpot deal ${workspace.hubspot_deal_id}.` : "Select a HubSpot deal before any HubSpot handoff.",
  ];
  return NextResponse.json({ previewOnly: true, acceptedAt: workspace.accepted_at, revision: { id: revision.id, number: revision.revision_number, sellPrice: revision.sell_price, marginPct: revision.margin_pct }, workspace: { title: workspace.title, clientName: workspace.client_name }, proposedActions });
}
