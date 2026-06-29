import { NextRequest, NextResponse } from "next/server";

import { requireMaterialsAdmin } from "@/lib/materials/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, context: { params: Promise<{ batchId: string }> }) {
  const auth = await requireMaterialsAdmin();
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  const { batchId } = await context.params;

  const { data: batch, error: batchError } = await supabase
    .from("material_import_batches")
    .select("id, source_name, source_url, uploaded_by, status, summary, created_at")
    .eq("id", batchId)
    .single();

  if (batchError || !batch) {
    return NextResponse.json({ error: batchError?.message ?? "batch not found" }, { status: 404 });
  }

  const { data: rows, error: rowsError } = await supabase
    .from("material_import_rows")
    .select("id, sheet_name, source_row_number, normalized_candidate, status, error_text")
    .eq("batch_id", batchId)
    .order("sheet_name", { ascending: true })
    .order("source_row_number", { ascending: true })
    .limit(250);

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  return NextResponse.json({ batch, rows: rows ?? [] });
}
