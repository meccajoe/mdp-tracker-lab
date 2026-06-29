import { NextRequest, NextResponse } from "next/server";

import { shouldCaptureMaterialAlias, sameMaterialText } from "@/lib/materials/match";
import type { MaterialImportNormalizedCandidate } from "@/lib/materials/import";
import { normalizeAliasText, requireMaterialsAdmin } from "@/lib/materials/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExistingVendorPrice = {
  id: string;
  vendor_id: string | null;
  vendor_sku: string | null;
  vendor_material_name: string | null;
  vendor_dimension_text: string | null;
  unit: string | null;
  pack_quantity: number | null;
  price: number;
  price_basis: string | null;
  is_current: boolean;
};

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

  if (normalizeAliasText(vendorRow?.name ?? "") === normalizedAlias) return;

  const { data: existingAlias } = await supabase
    .from("vendor_aliases")
    .select("id, vendor_id")
    .eq("normalized_alias_text", normalizedAlias)
    .maybeSingle();

  if (existingAlias?.vendor_id && existingAlias.vendor_id !== vendorId) return;
  if (existingAlias?.id) return;

  await supabase.from("vendor_aliases").insert({
    vendor_id: vendorId,
    alias_text: aliasText,
    normalized_alias_text: normalizedAlias,
    source_type: sourceType,
  });
}

async function captureMaterialAlias(supabase: any, materialId: string, importedName: string | null, canonicalName: string | null) {
  if (!shouldCaptureMaterialAlias(importedName, canonicalName)) return;

  const aliasText = importedName!.trim();
  const normalizedAlias = normalizeAliasText(aliasText);
  const { data: existingAlias } = await supabase
    .from("material_aliases")
    .select("id")
    .eq("material_id", materialId)
    .eq("normalized_alias_text", normalizedAlias)
    .maybeSingle();

  if (existingAlias?.id) return;

  await supabase.from("material_aliases").insert({
    material_id: materialId,
    alias_text: aliasText,
    normalized_alias_text: normalizedAlias,
  });
}

function isExactCurrentVendorPriceDuplicate(existingRows: ExistingVendorPrice[], candidate: MaterialImportNormalizedCandidate, vendorId: string | null) {
  return existingRows.find((row) =>
    row.is_current &&
    row.vendor_id === vendorId &&
    Number(row.price).toFixed(2) === Number(candidate.price ?? 0).toFixed(2) &&
    (row.price_basis ?? null) === (candidate.unit ?? null) &&
    sameMaterialText(row.unit, candidate.unit) &&
    sameMaterialText(row.vendor_material_name, candidate.materialName) &&
    sameMaterialText(row.vendor_dimension_text, candidate.dimensions) &&
    Number(row.pack_quantity ?? 0) === Number(candidate.packQuantity ?? 0)
  ) ?? null;
}

async function retireCurrentVendorPrices(supabase: any, materialId: string, vendorId: string | null) {
  let query = supabase
    .from("material_vendor_prices")
    .update({ is_current: false, updated_at: new Date().toISOString() })
    .eq("material_id", materialId)
    .eq("is_current", true);

  if (vendorId) {
    query = query.eq("vendor_id", vendorId);
  } else {
    query = query.is("vendor_id", null);
  }

  await query;
}

async function resolveMaterialId(
  supabase: any,
  candidate: MaterialImportNormalizedCandidate,
  vendorId: string | null,
  actorEmail: string,
  batchId: string,
  updatedBy?: string
) {
  if (candidate.match.material_id) {
    const { data: existingMaterial } = await supabase
      .from("materials")
      .select("id, canonical_name")
      .eq("id", candidate.match.material_id)
      .maybeSingle();

    if (existingMaterial?.id) {
      await captureMaterialAlias(supabase, existingMaterial.id, candidate.materialName, existingMaterial.canonical_name);
      return { materialId: existingMaterial.id, materialLabel: existingMaterial.canonical_name, created: false };
    }
  }

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
      created_by: updatedBy?.trim() || actorEmail,
      updated_by: updatedBy?.trim() || actorEmail,
    })
    .select("id, canonical_name")
    .single();

  if (materialError || !createdMaterial) {
    throw new Error(materialError?.message ?? "failed to create material");
  }

  await supabase.from("material_change_log").insert({
    material_id: createdMaterial.id,
    entity_type: "material",
    entity_id: createdMaterial.id,
    change_type: "create",
    new_value: candidate,
    changed_by: updatedBy?.trim() || actorEmail,
    batch_id: batchId,
  });

  return { materialId: createdMaterial.id, materialLabel: createdMaterial.canonical_name, created: true };
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
    .select("id, sheet_name, source_row_number, normalized_candidate, status, error_text")
    .eq("batch_id", batch.id);

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  let importedCount = 0;
  let dedupedCount = 0;
  let createdMaterialCount = 0;
  let matchedMaterialCount = 0;
  let skippedCount = 0;

  for (const row of importRows ?? []) {
    if (row.status === "needs_review") {
      skippedCount += 1;
      continue;
    }

    if (row.status === "skipped") {
      skippedCount += 1;
      continue;
    }

    const candidate = row.normalized_candidate as MaterialImportNormalizedCandidate;
    if (!candidate?.materialName || !candidate?.category || candidate.price == null) {
      await supabase
        .from("material_import_rows")
        .update({ status: "error", error_text: "missing_required_fields_at_commit" })
        .eq("id", row.id);
      continue;
    }

    const vendorId = await resolveVendorId(supabase, candidate.vendorName ?? null);
    const materialResolution = await resolveMaterialId(
      supabase,
      candidate,
      vendorId,
      actorEmail,
      batch.id,
      body.updatedBy
    );

    if (materialResolution.created) createdMaterialCount += 1;
    else matchedMaterialCount += 1;

    await captureVendorAlias(supabase, vendorId, candidate.vendorName ?? null, "spreadsheet");

    const { data: existingVendorPrices, error: existingVendorPricesError } = await supabase
      .from("material_vendor_prices")
      .select("id, vendor_id, vendor_sku, vendor_material_name, vendor_dimension_text, unit, pack_quantity, price, price_basis, is_current")
      .eq("material_id", materialResolution.materialId)
      .eq("is_current", true);

    if (existingVendorPricesError) {
      return NextResponse.json({ error: existingVendorPricesError.message }, { status: 500 });
    }

    const duplicateRow = isExactCurrentVendorPriceDuplicate((existingVendorPrices ?? []) as ExistingVendorPrice[], candidate, vendorId);
    if (duplicateRow) {
      await supabase
        .from("material_import_rows")
        .update({ status: "imported", error_text: "deduped_existing_vendor_price" })
        .eq("id", row.id);
      dedupedCount += 1;
      continue;
    }

    await retireCurrentVendorPrices(supabase, materialResolution.materialId, vendorId);

    const { data: insertedPrice, error: priceError } = await supabase
      .from("material_vendor_prices")
      .insert({
        material_id: materialResolution.materialId,
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
      })
      .select("id")
      .single();

    if (priceError || !insertedPrice) {
      return NextResponse.json({ error: priceError?.message ?? "failed to create vendor price" }, { status: 500 });
    }

    await supabase.from("material_change_log").insert({
      material_id: materialResolution.materialId,
      entity_type: "material_vendor_price",
      entity_id: insertedPrice.id,
      change_type: "import_commit",
      new_value: candidate,
      changed_by: body.updatedBy?.trim() || actorEmail,
      batch_id: batch.id,
    });

    const { error: rowUpdateError } = await supabase
      .from("material_import_rows")
      .update({ status: "imported", error_text: null })
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
    dedupedCount,
    createdMaterialCount,
    matchedMaterialCount,
    skippedCount,
  };

  const { error: batchUpdateError } = await supabase
    .from("material_import_batches")
    .update({ status: "committed", summary: committedSummary })
    .eq("id", batch.id);

  if (batchUpdateError) {
    return NextResponse.json({ error: batchUpdateError.message }, { status: 500 });
  }

  return NextResponse.json({
    batchId: batch.id,
    status: "committed",
    importedCount,
    dedupedCount,
    createdMaterialCount,
    matchedMaterialCount,
    skippedCount,
    summary: committedSummary,
  });
}
