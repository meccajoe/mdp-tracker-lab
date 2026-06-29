import { NextRequest, NextResponse } from "next/server";

import { requireMaterialsAdmin } from "@/lib/materials/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeMaterialPatch(payload: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = {};
  const stringFields = ["canonical_name", "category", "subcategory", "dimensions", "thickness_text", "base_unit", "sku_or_code", "finish", "notes", "updated_by"] as const;

  for (const field of stringFields) {
    if (!(field in payload)) continue;
    const value = payload[field];
    sanitized[field] = typeof value === "string" && value.trim() ? value.trim() : null;
  }

  if ("default_vendor_id" in payload) {
    sanitized.default_vendor_id = typeof payload.default_vendor_id === "string" && payload.default_vendor_id.trim()
      ? payload.default_vendor_id.trim()
      : null;
  }

  if ("default_price" in payload) {
    sanitized.default_price = typeof payload.default_price === "number"
      ? payload.default_price
      : payload.default_price
        ? Number(payload.default_price)
        : null;
  }

  if ("active" in payload) {
    sanitized.active = payload.active === false ? false : Boolean(payload.active);
  }

  return sanitized;
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMaterialsAdmin();
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  const { id } = await context.params;

  const { data, error } = await supabase
    .from("materials")
    .select(`
      *,
      default_vendor:vendors!materials_default_vendor_id_fkey(id, name),
      material_vendor_prices(
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
        vendor:vendors(id, name)
      ),
      material_aliases(
        id,
        alias_text,
        normalized_alias_text,
        created_at
      )
    `)
    .eq("id", id)
    .single();

  if (error) {
    console.error("[materials/get]", error);
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  const currentPrices = (data.material_vendor_prices ?? []).filter((row: { is_current?: boolean | null }) => row.is_current);
  const aliases = [...(data.material_aliases ?? [])].sort((a: { alias_text?: string | null }, b: { alias_text?: string | null }) =>
    String(a.alias_text ?? "").localeCompare(String(b.alias_text ?? ""))
  );

  return NextResponse.json({
    item: {
      ...data,
      material_vendor_prices: currentPrices,
      material_aliases: aliases,
    },
  });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMaterialsAdmin();
  if (!auth.ok) return auth.response;

  const { supabase, actorEmail } = auth;
  const { id } = await context.params;
  const rawPayload = (await req.json()) as Record<string, unknown>;
  const patchPayload = sanitizeMaterialPatch(rawPayload);

  patchPayload.updated_by = patchPayload.updated_by ?? actorEmail;

  const { data: existing, error: existingError } = await supabase
    .from("materials")
    .select("*")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: existingError?.message ?? "material not found" }, { status: 404 });
  }

  if (patchPayload.canonical_name === "" || patchPayload.category === "") {
    return NextResponse.json({ error: "canonical_name and category cannot be blank" }, { status: 400 });
  }

  const isArchiving = patchPayload.active === false && existing.active !== false;
  const archiveAction = isArchiving ? "archive" : "update";

  const { data, error } = await supabase
    .from("materials")
    .update(patchPayload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[materials/patch]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("material_change_log").insert({
    material_id: data.id,
    entity_type: "material",
    entity_id: data.id,
    change_type: archiveAction,
    old_value: existing,
    new_value: data,
    changed_by: typeof rawPayload.updated_by === "string" && rawPayload.updated_by.trim() ? rawPayload.updated_by.trim() : actorEmail,
  });

  return NextResponse.json({ item: data });
}
