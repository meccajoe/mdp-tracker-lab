import { NextRequest, NextResponse } from "next/server";

import { enrichImportCandidate } from "@/lib/materials/import";
import { requireMaterialsAdmin } from "@/lib/materials/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canApproveCandidate(candidate: Record<string, unknown>) {
  return Boolean(candidate.materialName) && Boolean(candidate.category) && candidate.price != null && !Number.isNaN(Number(candidate.price));
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ rowId: string }> }) {
  const auth = await requireMaterialsAdmin();
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  const { rowId } = await context.params;
  const body = (await req.json()) as {
    action?: "save_review" | "approve" | "skip";
    normalized_candidate?: Record<string, unknown>;
  };

  const { data: existingRow, error: existingRowError } = await supabase
    .from("material_import_rows")
    .select("id, normalized_candidate")
    .eq("id", rowId)
    .single();

  if (existingRowError || !existingRow) {
    return NextResponse.json({ error: existingRowError?.message ?? "import row not found" }, { status: 404 });
  }

  const candidate = (body.normalized_candidate ?? existingRow.normalized_candidate ?? {}) as Record<string, unknown>;
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
    return NextResponse.json({ error: materialsError.message }, { status: 500 });
  }

  const enriched = enrichImportCandidate(candidate, {
    existingMaterials: (existingMaterials ?? []) as any[],
  });

  let nextStatus = enriched.status;
  let errorText = enriched.error_text;

  if (body.action === "skip") {
    nextStatus = "skipped";
    errorText = errorText ?? "skipped_by_reviewer";
  }

  if (body.action === "approve") {
    if (!canApproveCandidate(candidate)) {
      return NextResponse.json({ error: "materialName, category, and price are required before approval" }, { status: 400 });
    }

    nextStatus = "parsed";
    errorText = enriched.error_text ? `approved_manually: ${enriched.error_text}` : null;
  }

  const { data, error } = await supabase
    .from("material_import_rows")
    .update({
      normalized_candidate: enriched.normalized_candidate,
      status: nextStatus,
      error_text: errorText,
    })
    .eq("id", rowId)
    .select("id, sheet_name, source_row_number, normalized_candidate, status, error_text")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "failed to update import row" }, { status: 500 });
  }

  return NextResponse.json({ row: data });
}
