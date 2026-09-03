import { NextResponse } from "next/server";
import { requireAdaWorkspaceAccess } from "@/lib/ada-server";
const ASSET_BUCKET = "ada-quote-assets";

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string; assetId: string }> }) {
  const { workspaceId, assetId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId);
  if (!access.ok) return access.response;
  const { data: asset, error } = await access.supabase.from("ada_quote_assets").select("id, storage_path, analysis_status").eq("id", assetId).eq("workspace_id", workspaceId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: "Ada asset not found for this chat." }, { status: 404 });
  if (asset.analysis_status === "uploading") return NextResponse.json({ error: "Ada asset upload is not complete." }, { status: 409 });
  const { data, error: signedError } = await access.supabase.storage.from(ASSET_BUCKET).createSignedUrl(asset.storage_path, 60 * 60);
  if (signedError || !data?.signedUrl) return NextResponse.json({ error: signedError?.message ?? "Could not create a secure preview." }, { status: 500 });
  return NextResponse.json({ signedUrl: data.signedUrl });
}

export async function DELETE(_request: Request, context: { params: Promise<{ workspaceId: string; assetId: string }> }) {
  const { workspaceId, assetId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId, "edit_draft");
  if (!access.ok) return access.response;
  const { data: asset, error } = await access.supabase.from("ada_quote_assets").select("id, concept_id, storage_path, original_name").eq("id", assetId).eq("workspace_id", workspaceId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: "Ada asset not found for this chat." }, { status: 404 });
  const { error: storageError } = await access.supabase.storage.from(ASSET_BUCKET).remove([asset.storage_path]);
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 });
  const { error: deleteError } = await access.supabase.from("ada_quote_assets").delete().eq("id", assetId).eq("workspace_id", workspaceId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  await Promise.all([
    access.supabase.from("ada_quote_events").insert({ workspace_id: workspaceId, concept_id: asset.concept_id, event_type: "asset_deleted", actor_email: access.actorEmail, payload_json: { asset_id: assetId, original_name: asset.original_name } }),
    access.supabase.from("ada_quote_workspaces").update({ last_activity_at: new Date().toISOString() }).eq("id", workspaceId).eq("created_by_email", access.actorEmail),
  ]);
  return NextResponse.json({ deletedAssetId: assetId });
}
