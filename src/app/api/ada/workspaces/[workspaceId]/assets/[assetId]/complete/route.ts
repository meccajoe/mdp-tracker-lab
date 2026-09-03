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
    .maybeSingle();

  if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: "Ada asset not found for this quote." }, { status: 404 });

  const { data, error } = await access.supabase
    .from("ada_quote_assets")
    .update({ analysis_status: "uploaded", analysis_error: null })
    .eq("id", assetId)
    .select("id, workspace_id, concept_id, storage_path, original_name, mime_type, byte_size, analysis_status, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await Promise.all([
    access.supabase.from("ada_quote_events").insert({ workspace_id: workspaceId, concept_id: asset.concept_id, event_type: "asset_uploaded", actor_email: access.actorEmail, payload_json: { asset_id: assetId, original_name: data.original_name } }),
    access.supabase.from("ada_quote_workspaces").update({ last_activity_at: new Date().toISOString(), status: "gathering_inputs" }).eq("id", workspaceId),
  ]);

  return NextResponse.json({ asset: data });
}
