import { NextResponse } from "next/server";

import { requireAdaAccess } from "@/lib/ada-server";

const ASSET_BUCKET = "ada-quote-assets";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; assetId: string }> },
) {
  const access = await requireAdaAccess();
  if (!access.ok) return access.response;

  const { workspaceId, assetId } = await context.params;
  const { data: asset, error: assetError } = await access.supabase
    .from("ada_quote_assets")
    .select("id, storage_path, analysis_status")
    .eq("id", assetId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: "Ada asset not found for this quote." }, { status: 404 });
  if (asset.analysis_status === "uploading") return NextResponse.json({ error: "Ada asset upload is not complete." }, { status: 409 });

  const { data, error } = await access.supabase.storage.from(ASSET_BUCKET).createSignedUrl(asset.storage_path, 60 * 60);
  if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message ?? "Could not create a secure preview." }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
