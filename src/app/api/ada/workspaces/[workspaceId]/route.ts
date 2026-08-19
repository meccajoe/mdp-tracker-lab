import { NextResponse } from "next/server";

import { requireAdaAccess } from "@/lib/ada-server";

const ASSET_BUCKET = "ada-quote-assets";

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const access = await requireAdaAccess();
  if (!access.ok) return access.response;

  const { workspaceId } = await context.params;
  const [workspaceResult, conceptsResult, messagesResult, eventsResult, assetsResult] = await Promise.all([
    access.supabase.from("ada_quote_workspaces").select("id, ada_project_id, title, client_name, contact_name, hubspot_deal_id, tracker_project_id, status, last_activity_at, pinned_at, archived_at, created_by_email, created_at, updated_at").eq("id", workspaceId).eq("created_by_email", access.actorEmail).maybeSingle(),
    access.supabase.from("ada_quote_concepts").select("id, workspace_id, label, mode, status, created_by_email, created_at, updated_at").eq("workspace_id", workspaceId).order("created_at"),
    access.supabase.from("ada_quote_messages").select("id, workspace_id, concept_id, role, content, structured_payload_json, created_by_email, created_at").eq("workspace_id", workspaceId).order("created_at"),
    access.supabase.from("ada_quote_events").select("id, workspace_id, concept_id, event_type, payload_json, actor_email, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50),
    access.supabase.from("ada_quote_assets").select("id, workspace_id, concept_id, original_name, mime_type, byte_size, analysis_status, analysis_json, created_at").eq("workspace_id", workspaceId).order("created_at"),
  ]);

  if (workspaceResult.error) return NextResponse.json({ error: workspaceResult.error.message }, { status: 500 });
  if (!workspaceResult.data) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  if (conceptsResult.error || messagesResult.error || eventsResult.error || assetsResult.error) return NextResponse.json({ error: conceptsResult.error?.message ?? messagesResult.error?.message ?? eventsResult.error?.message ?? assetsResult.error?.message ?? "Ada chat could not load." }, { status: 500 });

  return NextResponse.json({ workspace: workspaceResult.data, concepts: conceptsResult.data ?? [], messages: messagesResult.data ?? [], events: eventsResult.data ?? [], assets: assetsResult.data ?? [] });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const access = await requireAdaAccess();
  if (!access.ok) return access.response;
  const { workspaceId } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = optionalText(body.title);
  const adaProjectId = optionalText(body.adaProjectId);
  if (!title) return NextResponse.json({ error: "Chat title is required." }, { status: 400 });

  if (adaProjectId) {
    const { data: project, error: projectError } = await access.supabase.from("ada_quote_projects").select("id").eq("id", adaProjectId).eq("created_by_email", access.actorEmail).maybeSingle();
    if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
    if (!project) return NextResponse.json({ error: "Ada project not found." }, { status: 404 });
  }

  const { data, error } = await access.supabase
    .from("ada_quote_workspaces")
    .update({ title, client_name: optionalText(body.clientName), contact_name: optionalText(body.contactName), ada_project_id: adaProjectId || undefined, last_activity_at: new Date().toISOString() })
    .eq("id", workspaceId)
    .eq("created_by_email", access.actorEmail)
    .select("id, ada_project_id, title, client_name, contact_name, updated_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  return NextResponse.json({ workspace: data });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const access = await requireAdaAccess();
  if (!access.ok) return access.response;
  const { workspaceId } = await context.params;
  const { data: workspace } = await access.supabase.from("ada_quote_workspaces").select("id").eq("id", workspaceId).eq("created_by_email", access.actorEmail).maybeSingle();
  if (!workspace) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  const { data: assets, error: assetsError } = await access.supabase.from("ada_quote_assets").select("storage_path").eq("workspace_id", workspaceId);
  if (assetsError) return NextResponse.json({ error: assetsError.message }, { status: 500 });
  if (assets?.length) {
    const { error: storageError } = await access.supabase.storage.from(ASSET_BUCKET).remove(assets.map((asset: { storage_path: string }) => asset.storage_path));
    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 });
  }
  const { error } = await access.supabase.from("ada_quote_workspaces").delete().eq("id", workspaceId).eq("created_by_email", access.actorEmail);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deletedWorkspaceId: workspaceId });
}
