import { NextRequest, NextResponse } from "next/server";

import { normalizeAliasText, requireMaterialsAdmin } from "@/lib/materials/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveVendorId(supabase: any, vendorName: string | null): Promise<string | null> {
  if (!vendorName?.trim()) return null;

  const normalizedVendorName = normalizeAliasText(vendorName);

  const aliasLookup = await supabase
    .from("vendor_aliases")
    .select("vendor_id")
    .eq("normalized_alias_text", normalizedVendorName)
    .limit(1)
    .maybeSingle();

  const aliasMatch = aliasLookup.data as { vendor_id: string } | null;
  if (aliasMatch?.vendor_id) return aliasMatch.vendor_id;

  const vendorLookup = await supabase
    .from("vendors")
    .select("id, name")
    .ilike("name", vendorName.trim())
    .limit(1)
    .maybeSingle();

  const existing = vendorLookup.data as { id: string; name: string } | null;
  if (existing?.id) return existing.id;

  const vendorCreate = await supabase
    .from("vendors")
    .insert({ name: vendorName.trim(), active: true })
    .select("id")
    .single();

  const created = vendorCreate.data as { id: string } | null;
  const error = vendorCreate.error;

  if (error || !created) {
    throw new Error(error?.message ?? `failed to create vendor ${vendorName}`);
  }

  return created.id;
}

async function captureVendorAlias(supabase: any, vendorId: string | null, vendorName: string | null, sourceType: string) {
  if (!vendorId || !vendorName?.trim()) return;

  const aliasText = vendorName.trim();
  const normalizedAlias = normalizeAliasText(aliasText);
  const { data: vendorRow } = await supabase
    .from("vendors")
    .select("name")
    .eq("id", vendorId)
    .maybeSingle();

  if (normalizeAliasText(vendorRow?.name ?? "") === normalizedAlias) {
    return;
  }

  const { data: existingAlias } = await supabase
    .from("vendor_aliases")
    .select("id, vendor_id")
    .eq("normalized_alias_text", normalizedAlias)
    .maybeSingle();

  if (existingAlias?.vendor_id && existingAlias.vendor_id !== vendorId) {
    return;
  }

  if (existingAlias?.id) {
    return;
  }

  await supabase.from("vendor_aliases").insert({
    vendor_id: vendorId,
    alias_text: aliasText,
    normalized_alias_text: normalizedAlias,
    source_type: sourceType,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireMaterialsAdmin();
  if (!auth.ok) return auth.response;

  const { supabase, actorEmail } = auth;
  const body = (await req.json()) as { batchId?: string; updatedBy?: string };

  if (!body.batchId?.trim()) {
    return NextResponse.json({ error: "batchId is required" }, { status: 400 });
  }

  const { data: batch, error: batchError } = await supabase
    .from("material_import_batches")
    .select("id, status, summary")
    .eq("id", body.batchId.trim())
    .single();

  if (batchError || !batch) {
    return NextResponse.json({ error: batchError?.message ?? "batch not found" }, { status: 404 });
  }

  const { data: importRows, error: rowsError } = await supabase
    .from("material_import_rows")
    .select("id, sheet_name, source_row_number, normalized_candidate, status")
    .eq("batch_id", batch.id)
    .in("status", ["parsed", "needs_review"]);

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  let importedCount = 0;

  for (const row of importRows ?? []) {
    if (row.status === "needs_review") continue;

    const candidate = row.normalized_candidate as {
      category?: string | null;
      materialName?: string | null;
      vendorName?: string | null;
      dimensions?: string | null;
      thicknessText?: string | null;
      unit?: string | null;
      price?: number | null;
      notes?: string | null;
      packQuantity?: number | null;
    };

    if (!candidate.materialName || !candidate.category || candidate.price == null) continue;

    const vendorId = await resolveVendorId(supabase, candidate.vendorName ?? null);

    const { data: existingMatches, error: existingError } = await supabase
      .from("materials")
      .select("id, canonical_name, category, dimensions, thickness_text")
      .eq("canonical_name", candidate.materialName)
      .eq("category", candidate.category);

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const existing = (existingMatches ?? []).find((item: any) =>
      (item.dimensions ?? null) === (candidate.dimensions ?? null) &&
      (item.thickness_text ?? null) === (candidate.thicknessText ?? null)
    );

    let materialId = existing?.id ?? null;

    if (!materialId) {
      const { data: createdMaterial, error: materialError } = await supabase
        .from("materials")
        .insert({
          canonical_name: candidate.materialName,
          category: candidate.category,
          dimensions: candidate.dimensions ?? null,
          thickness_text: candidate.thicknessText ?? null,
          base_unit: candidate.unit ?? null,
          default_vendor_id: vendorId,
          default_price: candidate.price,
          notes: candidate.notes ?? null,
          created_by: body.updatedBy?.trim() || actorEmail,
          updated_by: body.updatedBy?.trim() || actorEmail,
        })
        .select("id")
        .single();

      if (materialError || !createdMaterial) {
        return NextResponse.json({ error: materialError?.message ?? "failed to create material" }, { status: 500 });
      }

      materialId = createdMaterial.id;

      await supabase.from("material_change_log").insert({
        material_id: materialId,
        entity_type: "material",
        entity_id: materialId,
        change_type: "create",
        new_value: candidate,
        changed_by: body.updatedBy?.trim() || actorEmail,
        batch_id: batch.id,
      });
    }

    await captureVendorAlias(supabase, vendorId, candidate.vendorName ?? null, "spreadsheet");

    const { error: priceError } = await supabase.from("material_vendor_prices").insert({
      material_id: materialId,
      vendor_id: vendorId,
      vendor_material_name: candidate.materialName,
      vendor_dimension_text: candidate.dimensions ?? null,
      unit: candidate.unit ?? null,
      pack_quantity: candidate.packQuantity ?? null,
      price: candidate.price,
      price_basis: candidate.unit ?? null,
      source_type: "spreadsheet",
      source_ref: `${row.sheet_name}:${row.source_row_number}`,
      is_current: true,
      notes: candidate.notes ?? null,
    });

    if (priceError) {
      return NextResponse.json({ error: priceError.message }, { status: 500 });
    }

    await supabase.from("material_change_log").insert({
      material_id: materialId,
      entity_type: "material_vendor_price",
      entity_id: materialId,
      change_type: "import_commit",
      new_value: candidate,
      changed_by: body.updatedBy?.trim() || actorEmail,
      batch_id: batch.id,
      });

    const { error: rowUpdateError } = await supabase
      .from("material_import_rows")
      .update({ status: "imported" })
      .eq("id", row.id);

    if (rowUpdateError) {
      return NextResponse.json({ error: rowUpdateError.message }, { status: 500 });
    }

    importedCount += 1;
  }

  const committedSummary = {
    ...(batch.summary as Record<string, unknown> | null),
    committedAt: new Date().toISOString(),
    importedCount,
  };

  const { error: batchUpdateError } = await supabase
    .from("material_import_batches")
    .update({ status: "committed", summary: committedSummary })
    .eq("id", batch.id);

  if (batchUpdateError) {
    return NextResponse.json({ error: batchUpdateError.message }, { status: 500 });
  }

  return NextResponse.json({ batchId: batch.id, status: "committed", importedCount, summary: committedSummary });
}
