import { NextResponse } from "next/server";

import { requireAdaWorkspaceAccess } from "@/lib/ada-server";

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId);
  if (!access.ok) return access.response;
  const [workspaceResult, messagesResult, eventsResult, assetsResult] = await Promise.all([
    access.supabase.from("ada_quote_workspaces").select("id, ada_project_id, title, client_name, contact_name, hubspot_deal_id, tracker_project_id, status, last_activity_at, pinned_at, archived_at, created_by_email, created_at, updated_at").eq("id", workspaceId).maybeSingle(),
    access.supabase.from("ada_quote_messages").select("id, workspace_id, concept_id, role, content, structured_payload_json, created_by_email, created_at").eq("workspace_id", workspaceId).order("created_at"),
    access.supabase.from("ada_quote_events").select("id, workspace_id, concept_id, event_type, payload_json, actor_email, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50),
    access.supabase.from("ada_quote_assets").select("id, workspace_id, concept_id, original_name, mime_type, byte_size, analysis_status, analysis_json, created_at").eq("workspace_id", workspaceId).is("archived_at", null).order("created_at"),
  ]);

  if (workspaceResult.error) return NextResponse.json({ error: workspaceResult.error.message }, { status: 500 });
  if (!workspaceResult.data) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  if (messagesResult.error || eventsResult.error || assetsResult.error) return NextResponse.json({ error: messagesResult.error?.message ?? eventsResult.error?.message ?? assetsResult.error?.message ?? "Ada chat could not load." }, { status: 500 });

  return NextResponse.json({ workspace: workspaceResult.data, messages: messagesResult.data ?? [], events: eventsResult.data ?? [], assets: assetsResult.data ?? [] });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId, "edit_draft");
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = optionalText(body.title);
  const adaProjectId = optionalText(body.adaProjectId);
  if (!title) return NextResponse.json({ error: "Chat title is required." }, { status: 400 });

  if (adaProjectId) {
    const { data: project, error: projectError } = await access.supabase.from("ada_quote_projects").select("id").eq("id", adaProjectId).eq("created_by_email", access.actorEmail).maybeSingle();
    if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
    if (!project) return NextResponse.json({ error: "Ada project not found." }, { status: 404 });
  }

  const { data, error } = await access.actorSupabase
    .rpc("update_ada_quote_workspace_metadata", {
      p_workspace_id: workspaceId,
      p_actor_email: access.actorEmail,
      p_title: title,
      p_client_name: optionalText(body.clientName),
      p_contact_name: optionalText(body.contactName),
      p_ada_project_id: adaProjectId || null,
    })
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  return NextResponse.json({ workspace: data });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId, "archive_workspace");
  if (!access.ok) return access.response;
  const { data: workspace, error: workspaceError } = await access.supabase
    .from("ada_quote_workspaces")
    .select("row_version, lifecycle_status")
    .eq("id", workspaceId)
    .maybeSingle();
  if (workspaceError) return NextResponse.json({ error: workspaceError.message }, { status: 500 });
  if (!workspace) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  if (workspace.lifecycle_status !== "archived") {
    const { error } = await access.actorSupabase.rpc("append_quote_workflow_event", {
      p_workspace_id: workspaceId,
      p_revision_id: null,
      p_event_type: "workspace_archived",
      p_actor_email: access.actorEmail,
      p_actor_role: access.quoteActor.workspaceRole,
      p_actor_capability: "archive_workspace",
      p_expected_row_version: workspace.row_version,
      p_resulting_state: "archived",
      p_reason: "Operator archived workspace",
      p_evidence_refs: [],
      p_payload_json: {},
      p_idempotency_key: `workspace-archive:${workspaceId}`,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ deletedWorkspaceId: workspaceId });
}
