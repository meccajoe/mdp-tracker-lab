import { NextResponse } from "next/server";

import { requireAdaWorkspaceAccess } from "@/lib/ada-server";
import { analyzeAdaAsset } from "@/lib/ada-vision";

const ASSET_BUCKET = "ada-quote-assets";

export async function POST(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; assetId: string }> },
) {
  const { workspaceId, assetId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId, "attach_evidence");
  if (!access.ok) return access.response;
  const { data: asset, error: assetError } = await access.supabase
    .from("ada_quote_assets")
    .select("id, workspace_id, concept_id, storage_path, original_name, mime_type, analysis_status")
    .eq("id", assetId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: "Ada asset not found for this quote." }, { status: 404 });
  if (asset.analysis_status === "uploading") return NextResponse.json({ error: "Finish the file upload before analysis." }, { status: 409 });

  await access.supabase.from("ada_quote_assets").update({ analysis_status: "analyzing", analysis_error: null }).eq("id", assetId);

  try {
    const { data: download, error: downloadError } = await access.supabase.storage.from(ASSET_BUCKET).download(asset.storage_path);
    if (downloadError || !download) throw new Error(downloadError?.message ?? "Could not retrieve the evidence file.");

    const buffer = Buffer.from(await download.arrayBuffer());
    const result = await analyzeAdaAsset({ buffer, mimeType: asset.mime_type, fileName: asset.original_name });
    const analysisJson = { ...result.analysis, model_trace: result.modelTrace, analyzed_at: new Date().toISOString() };
    const { data: updated, error: updateError } = await access.supabase
      .from("ada_quote_assets")
      .update({ analysis_status: "ready", analysis_json: analysisJson, analysis_error: null })
      .eq("id", assetId)
      .select("id, analysis_status, analysis_json")
      .single();

    if (updateError) throw new Error(updateError.message);
    await access.supabase.from("ada_quote_events").insert({ workspace_id: workspaceId, concept_id: asset.concept_id, event_type: "asset_analyzed", actor_email: access.actorEmail, payload_json: { asset_id: assetId, model_trace: result.modelTrace } });
    return NextResponse.json({ asset: updated });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Ada could not analyze this evidence.";
    await access.supabase.from("ada_quote_assets").update({ analysis_status: "failed", analysis_error: message }).eq("id", assetId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
