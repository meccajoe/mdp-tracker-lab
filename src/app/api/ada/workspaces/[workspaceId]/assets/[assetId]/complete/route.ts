import { NextResponse } from "next/server";

import { requireAdaWorkspaceAccess } from "@/lib/ada-server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; assetId: string }> },
) {
  const { workspaceId, assetId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId, "attach_evidence");
  if (!access.ok) return access.response;
  const { data: asset, error: assetError } = await access.supabase
    .from("ada_quote_assets")
    .select("id, workspace_id, concept_id")
    .eq("id", assetId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .maybeSingle();

  if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: "Ada asset not found for this quote." }, { status: 404 });

  const { data, error } = await access.supabase
    .from("ada_quote_assets")
    .update({ analysis_status: "uploaded", analysis_error: null })
    .eq("id", assetId)
    .is("archived_at", null)
    .select("id, workspace_id, concept_id, storage_path, original_name, mime_type, byte_size, analysis_status, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: eventError } = await access.actorSupabase.rpc("record_ada_compatibility_event", {
    p_workspace_id: workspaceId,
    p_concept_id: asset.concept_id,
    p_event_type: "asset_uploaded",
    p_actor_email: access.actorEmail,
    p_actor_capability: "attach_evidence",
    p_workspace_status: "gathering_inputs",
    p_payload_json: { asset_id: assetId, original_name: data.original_name },
    p_idempotency_key: `asset-uploaded:${workspaceId}:${assetId}`,
  });
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });

  return NextResponse.json({ asset: data });
}
