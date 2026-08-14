import { NextResponse } from "next/server";

import { requireAdaWorkspaceAccess } from "@/lib/ada-server";

function normalizeLabel(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId);
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const { data: workspace, error: workspaceError } = await access.supabase
    .from("ada_quote_workspaces")
    .select("id")
    .eq("id", workspaceId)
    .eq("created_by_email", access.actorEmail)
    .maybeSingle();

  if (workspaceError) return NextResponse.json({ error: workspaceError.message }, { status: 500 });
  if (!workspace) return NextResponse.json({ error: "Ada quote not found." }, { status: 404 });

  const { count, error: countError } = await access.supabase
    .from("ada_quote_concepts")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  const label = normalizeLabel(body.label) ?? `Concept ${(count ?? 0) + 1}`;
  const mode = body.mode === "fast_pass" ? "fast_pass" : "standard";

  const { data, error } = await access.supabase
    .from("ada_quote_concepts")
    .insert({ workspace_id: workspaceId, label, mode, status: "draft", created_by_email: access.actorEmail })
    .select("id, workspace_id, label, mode, status, created_by_email, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await Promise.all([
    access.supabase.from("ada_quote_events").insert({ workspace_id: workspaceId, concept_id: data.id, event_type: "concept_created", actor_email: access.actorEmail, payload_json: { label, mode } }),
    access.supabase.from("ada_quote_workspaces").update({ last_activity_at: new Date().toISOString() }).eq("id", workspaceId),
  ]);

  return NextResponse.json({ concept: data }, { status: 201 });
}
