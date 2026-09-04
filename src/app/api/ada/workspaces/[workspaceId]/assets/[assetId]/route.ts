import { NextResponse } from "next/server";
import { requireAdaWorkspaceAccess } from "@/lib/ada-server";
const ASSET_BUCKET = "ada-quote-assets";

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string; assetId: string }> }) {
  const { workspaceId, assetId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId);
  if (!access.ok) return access.response;
  const { data: asset, error } = await access.supabase.from("ada_quote_assets").select("id, storage_path, analysis_status").eq("id", assetId).eq("workspace_id", workspaceId).is("archived_at", null).maybeSingle();
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
  const { data: asset, error } = await access.supabase.from("ada_quote_assets").select("id").eq("id", assetId).eq("workspace_id", workspaceId).is("archived_at", null).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: "Ada asset not found for this chat." }, { status: 404 });
  const { error: archiveError } = await access.actorSupabase.rpc("archive_ada_quote_asset", {
    p_workspace_id: workspaceId,
    p_asset_id: assetId,
    p_actor_email: access.actorEmail,
    p_idempotency_key: `asset-archive:${workspaceId}:${assetId}`,
  });
  if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 500 });
  return NextResponse.json({ archivedAssetId: assetId });
}
