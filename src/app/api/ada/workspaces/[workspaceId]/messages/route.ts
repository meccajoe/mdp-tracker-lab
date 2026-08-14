import { NextResponse } from "next/server";

import { requireAdaAccess } from "@/lib/ada-server";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const access = await requireAdaAccess();
  if (!access.ok) return access.response;

  const { workspaceId } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const conceptId = typeof body.conceptId === "string" ? body.conceptId.trim() : "";
  if (!content) return NextResponse.json({ error: "Message content is required." }, { status: 400 });
  if (!conceptId) return NextResponse.json({ error: "Choose a concept before messaging Ada." }, { status: 400 });

  const { data: concept, error: conceptError } = await access.supabase
    .from("ada_quote_concepts")
    .select("id, workspace_id")
    .eq("id", conceptId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (conceptError) return NextResponse.json({ error: conceptError.message }, { status: 500 });
  if (!concept) return NextResponse.json({ error: "Ada concept not found for this quote." }, { status: 404 });

  const { data, error } = await access.supabase
    .from("ada_quote_messages")
    .insert({ workspace_id: workspaceId, concept_id: conceptId, role: "user", content, created_by_email: access.actorEmail })
    .select("id, workspace_id, concept_id, role, content, structured_payload_json, created_by_email, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await Promise.all([
    access.supabase.from("ada_quote_events").insert({ workspace_id: workspaceId, concept_id: conceptId, event_type: "message_saved", actor_email: access.actorEmail, payload_json: { message_id: data.id } }),
    access.supabase.from("ada_quote_workspaces").update({ last_activity_at: new Date().toISOString(), status: "gathering_inputs" }).eq("id", workspaceId),
  ]);

  return NextResponse.json({ message: data }, { status: 201 });
}
