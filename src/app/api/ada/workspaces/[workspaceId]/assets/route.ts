import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAdaWorkspaceAccess } from "@/lib/ada-server";

const ASSET_BUCKET = "ada-quote-assets";
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function safeFileName(value: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "drawing";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId);
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const originalName = typeof body.originalName === "string" ? body.originalName.trim() : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  const byteSize = typeof body.byteSize === "number" ? body.byteSize : Number(body.byteSize);
  const conceptId = typeof body.conceptId === "string" && body.conceptId.trim() ? body.conceptId.trim() : null;

  if (!originalName || !ALLOWED_MIME_TYPES.has(mimeType)) return NextResponse.json({ error: "Upload a PDF, PNG, JPEG, or WEBP drawing." }, { status: 400 });
  if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > MAX_FILE_SIZE) return NextResponse.json({ error: "Files must be between 1 byte and 50 MB." }, { status: 400 });

  const { data: workspace, error: workspaceError } = await access.supabase.from("ada_quote_workspaces").select("id").eq("id", workspaceId).maybeSingle();
  if (workspaceError) return NextResponse.json({ error: workspaceError.message }, { status: 500 });
  if (!workspace) return NextResponse.json({ error: "Ada quote not found." }, { status: 404 });

  if (conceptId) {
    const { data: concept, error: conceptError } = await access.supabase.from("ada_quote_concepts").select("id").eq("id", conceptId).eq("workspace_id", workspaceId).maybeSingle();
    if (conceptError) return NextResponse.json({ error: conceptError.message }, { status: 500 });
    if (!concept) return NextResponse.json({ error: "Ada concept not found for this quote." }, { status: 404 });
  }

  const assetId = randomUUID();
  const storagePath = `${workspaceId}/${assetId}-${safeFileName(originalName)}`;
  const { data: asset, error: insertError } = await access.supabase
    .from("ada_quote_assets")
    .insert({ id: assetId, workspace_id: workspaceId, concept_id: conceptId, storage_path: storagePath, original_name: originalName, mime_type: mimeType, byte_size: byteSize, analysis_status: "uploading", created_by_email: access.actorEmail })
    .select("id, workspace_id, concept_id, storage_path, original_name, mime_type, byte_size, analysis_status, created_at")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { data: signedUpload, error: uploadError } = await access.supabase.storage.from(ASSET_BUCKET).createSignedUploadUrl(storagePath);
  if (uploadError) {
    await access.supabase.from("ada_quote_assets").update({ analysis_status: "failed", analysis_error: "Could not prepare secure upload." }).eq("id", assetId);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  return NextResponse.json({ asset, signedUpload: { path: signedUpload.path, token: signedUpload.token, signedUrl: signedUpload.signedUrl } }, { status: 201 });
}
