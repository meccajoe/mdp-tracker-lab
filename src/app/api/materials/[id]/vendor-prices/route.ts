import { NextRequest, NextResponse } from "next/server";

import { requireMaterialsAdmin } from "@/lib/materials/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VendorPricePayload = {
  vendor_id: string | null;
  vendor_sku: string | null;
  vendor_material_name: string | null;
  vendor_dimension_text: string | null;
  unit: string | null;
  pack_quantity: number | null;
  price: number | null;
  price_basis: string | null;
  effective_date: string | null;
  source_type: "manual" | "spreadsheet" | "invoice" | "bill";
  source_ref: string | null;
  is_current: boolean;
  notes: string | null;
  set_as_default: boolean;
};

function sanitizeVendorPricePayload(payload: Record<string, unknown>): VendorPricePayload {
  const toTrimmedString = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const sourceType = toTrimmedString(payload.source_type);

  return {
    vendor_id: toTrimmedString(payload.vendor_id),
    vendor_sku: toTrimmedString(payload.vendor_sku),
    vendor_material_name: toTrimmedString(payload.vendor_material_name),
    vendor_dimension_text: toTrimmedString(payload.vendor_dimension_text),
    unit: toTrimmedString(payload.unit),
    pack_quantity: typeof payload.pack_quantity === "number"
      ? payload.pack_quantity
      : payload.pack_quantity
        ? Number(payload.pack_quantity)
        : null,
    price: typeof payload.price === "number"
      ? payload.price
      : payload.price
        ? Number(payload.price)
        : null,
    price_basis: toTrimmedString(payload.price_basis),
    effective_date: toTrimmedString(payload.effective_date),
    source_type: sourceType === "spreadsheet" || sourceType === "invoice" || sourceType === "bill" ? sourceType : "manual",
    source_ref: toTrimmedString(payload.source_ref),
    is_current: payload.is_current === false ? false : true,
    notes: toTrimmedString(payload.notes),
    set_as_default: payload.set_as_default === true,
  };
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMaterialsAdmin();
  if (!auth.ok) return auth.response;

  const { supabase, actorEmail } = auth;
  const { id: materialId } = await context.params;
  const rawPayload = (await req.json()) as Record<string, unknown>;
  const payload = sanitizeVendorPricePayload(rawPayload);

  if (payload.price == null || Number.isNaN(payload.price)) {
    return NextResponse.json({ error: "price is required" }, { status: 400 });
  }

  const { data: material, error: materialError } = await supabase
    .from("materials")
    .select("id")
    .eq("id", materialId)
    .single();

  if (materialError || !material) {
    return NextResponse.json({ error: materialError?.message ?? "material not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("material_vendor_prices")
    .insert({
      material_id: materialId,
      vendor_id: payload.vendor_id,
      vendor_sku: payload.vendor_sku,
      vendor_material_name: payload.vendor_material_name,
      vendor_dimension_text: payload.vendor_dimension_text,
      unit: payload.unit,
      pack_quantity: payload.pack_quantity,
      price: payload.price,
      price_basis: payload.price_basis,
      effective_date: payload.effective_date,
      source_type: payload.source_type,
      source_ref: payload.source_ref,
      is_current: payload.is_current,
      notes: payload.notes,
    })
    .select(`
      id,
      vendor_id,
      vendor_sku,
      vendor_material_name,
      vendor_dimension_text,
      unit,
      pack_quantity,
      price,
      price_basis,
      effective_date,
      source_type,
      source_ref,
      is_current,
      notes,
      vendor:vendors(id, name)
    `)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "failed to create vendor price" }, { status: 500 });
  }

  if (payload.set_as_default) {
    await supabase
      .from("materials")
      .update({
        default_vendor_id: payload.vendor_id,
        default_price: payload.price,
        updated_by: actorEmail,
      })
      .eq("id", materialId);
  }

  await supabase.from("material_change_log").insert({
    material_id: materialId,
    entity_type: "material_vendor_price",
    entity_id: data.id,
    change_type: "create",
    new_value: data,
    changed_by: actorEmail,
  });

  return NextResponse.json({ item: data }, { status: 201 });
}
