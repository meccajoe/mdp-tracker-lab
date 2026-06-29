import { NextRequest, NextResponse } from "next/server";

import { parseMaterialsWorkbook } from "@/lib/materials/workbook";
import { buildImportPreviewRows, summarizeImportRows } from "@/lib/materials/import";
import { requireMaterialsAdmin } from "@/lib/materials/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireMaterialsAdmin();
  if (!auth.ok) return auth.response;

  const { supabase, actorEmail } = auth;
  const body = (await req.json()) as { filePath?: string; sourceName?: string; sourceUrl?: string; uploadedBy?: string };

  if (!body.filePath?.trim()) {
    return NextResponse.json({ error: "filePath is required" }, { status: 400 });
  }

  const parsed = parseMaterialsWorkbook(body.filePath.trim());
  const previewRows = buildImportPreviewRows(parsed);
  const summary = summarizeImportRows(previewRows);

  const { data: batch, error: batchError } = await supabase
    .from("material_import_batches")
    .insert({
      source_name: body.sourceName?.trim() || body.filePath.trim().split("/").pop() || "materials-workbook.xlsx",
      source_url: body.sourceUrl?.trim() || null,
      uploaded_by: body.uploadedBy?.trim() || actorEmail,
      status: "preview",
      summary,
    })
    .select("id, status, source_name, created_at, summary")
    .single();

  if (batchError || !batch) {
    console.error("[materials/import/preview:batch]", batchError);
    return NextResponse.json({ error: batchError?.message ?? "failed to create import batch" }, { status: 500 });
  }

  if (previewRows.length > 0) {
    const rowsPayload = previewRows.map((row) => ({ ...row, batch_id: batch.id }));
    const { error: rowsError } = await supabase.from("material_import_rows").insert(rowsPayload);
    if (rowsError) {
      console.error("[materials/import/preview:rows]", rowsError);
      return NextResponse.json({ error: rowsError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ batchId: batch.id, summary, rows: previewRows.slice(0, 50) });
}
