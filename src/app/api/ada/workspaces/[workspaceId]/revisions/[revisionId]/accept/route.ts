import { NextResponse } from "next/server";
import { requireAdaAccess } from "@/lib/ada-server";

export async function POST(_request: Request, context: { params: Promise<{ workspaceId: string; revisionId: string }> }) {
  const access = await requireAdaAccess(); if (!access.ok) return access.response;
  const { workspaceId, revisionId } = await context.params;
  const [{ data: workspace }, { data: revision }] = await Promise.all([
    access.supabase.from("ada_quote_workspaces").select("id").eq("id", workspaceId).eq("created_by_email", access.actorEmail).maybeSingle(),
    access.supabase.from("ada_quote_revisions").select("id, revision_number").eq("id", revisionId).eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (!workspace || !revision) return NextResponse.json({ error: "Ada quote revision not found." }, { status: 404 });
  const now = new Date().toISOString();
  const { error: updateError } = await access.supabase.from("ada_quote_workspaces").update({ status: "accepted", last_activity_at: now }).eq("id", workspaceId).eq("created_by_email", access.actorEmail);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  const { error: eventError } = await access.supabase.from("ada_quote_events").insert({ workspace_id: workspaceId, event_type: "quote_accepted", actor_email: access.actorEmail, payload_json: { revision_id: revisionId, revision_number: revision.revision_number, accepted_at: now } });
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });
  return NextResponse.json({ acceptedRevisionId: revisionId, status: "accepted", acceptedAt: now });
}
