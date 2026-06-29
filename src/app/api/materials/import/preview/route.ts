import { NextRequest, NextResponse } from "next/server";

import { buildImportPreviewRows, summarizeImportRows } from "@/lib/materials/import";
import { requireMaterialsAdmin } from "@/lib/materials/server";
import { parseMaterialsWorkbook } from "@/lib/materials/workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREVIEW_ROW_LIMIT = 250;

export async function POST(req: NextRequest) {
  const auth = await requireMaterialsAdmin();
  if (!auth.ok) return auth.response;

  const { supabase, actorEmail } = auth;
  const body = (await req.json()) as { filePath?: string; sourceName?: string; sourceUrl?: string; uploadedBy?: string };

  if (!body.filePath?.trim()) {
    return NextResponse.json({ error: "filePath is required" }, { status: 400 });
  }

  const parsed = parseMaterialsWorkbook(body.filePath.trim());
  const { data: existingMaterials, error: materialsError } = await supabase
    .from("materials")
    .select(`
      id,
      canonical_name,
      category,
      dimensions,
      thickness_text,
      material_aliases(
        id,
        alias_text,
        normalized_alias_text
      )
    `)
    .eq("active", true);

  if (materialsError) {
    console.error("[materials/import/preview:materials]", materialsError);
    return NextResponse.json({ error: materialsError.message }, { status: 500 });
  }

  const previewRows = buildImportPreviewRows(parsed, {
    existingMaterials: (existingMaterials ?? []) as any[],
  });
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
    const rowsPayload = previewRows.map((row) => ({
      ...row,
      batch_id: batch.id,
      error_text: row.error_text,
    }));

    const { error: rowsInsertError } = await supabase
      .from("material_import_rows")
      .insert(rowsPayload);

    if (rowsInsertError) {
      console.error("[materials/import/preview:rows]", rowsInsertError);
      return NextResponse.json({ error: rowsInsertError.message }, { status: 500 });
    }

    const { data: stagedRows, error: stagedRowsError, count } = await supabase
      .from("material_import_rows")
      .select("id, sheet_name, source_row_number, normalized_candidate, status, error_text", { count: "exact" })
      .eq("batch_id", batch.id)
      .order("sheet_name", { ascending: true })
      .order("source_row_number", { ascending: true })
      .range(0, PREVIEW_ROW_LIMIT - 1);

    if (stagedRowsError) {
      console.error("[materials/import/preview:rows:reload]", stagedRowsError);
      return NextResponse.json({ error: stagedRowsError.message }, { status: 500 });
    }

    const rowTotal = typeof count === "number" ? count : stagedRows?.length ?? 0;

    return NextResponse.json({
      batchId: batch.id,
      summary,
      rows: stagedRows ?? [],
      rowLimit: PREVIEW_ROW_LIMIT,
      rowOffset: 0,
      rowTotal,
      rowsHasMore: (stagedRows?.length ?? 0) < rowTotal,
    });
  }

  return NextResponse.json({ batchId: batch.id, summary, rows: [], rowLimit: PREVIEW_ROW_LIMIT, rowOffset: 0, rowTotal: 0, rowsHasMore: false });
}
