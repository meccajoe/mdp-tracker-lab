import { NextRequest, NextResponse } from "next/server";

import { requireMaterialsAdmin } from "@/lib/materials/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeMaterialPayload(payload: Record<string, unknown>) {
  return {
    canonical_name: String(payload.canonical_name ?? "").trim(),
    category: String(payload.category ?? "").trim(),
    subcategory: typeof payload.subcategory === "string" && payload.subcategory.trim() ? payload.subcategory.trim() : null,
    dimensions: typeof payload.dimensions === "string" && payload.dimensions.trim() ? payload.dimensions.trim() : null,
    thickness_text: typeof payload.thickness_text === "string" && payload.thickness_text.trim() ? payload.thickness_text.trim() : null,
    base_unit: typeof payload.base_unit === "string" && payload.base_unit.trim() ? payload.base_unit.trim() : null,
    default_vendor_id: typeof payload.default_vendor_id === "string" && payload.default_vendor_id.trim() ? payload.default_vendor_id.trim() : null,
    default_price: typeof payload.default_price === "number" ? payload.default_price : payload.default_price ? Number(payload.default_price) : null,
    sku_or_code: typeof payload.sku_or_code === "string" && payload.sku_or_code.trim() ? payload.sku_or_code.trim() : null,
    finish: typeof payload.finish === "string" && payload.finish.trim() ? payload.finish.trim() : null,
    notes: typeof payload.notes === "string" && payload.notes.trim() ? payload.notes.trim() : null,
    active: payload.active === false ? false : true,
    updated_by: typeof payload.updated_by === "string" && payload.updated_by.trim() ? payload.updated_by.trim() : null,
    created_by: typeof payload.created_by === "string" && payload.created_by.trim() ? payload.created_by.trim() : null,
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireMaterialsAdmin();
  if (!auth.ok) return auth.response;

  const { supabase, actorEmail } = auth;

  const rawPayload = (await req.json()) as Record<string, unknown>;
  const payload = sanitizeMaterialPayload(rawPayload);

  if (!payload.canonical_name || !payload.category) {
    return NextResponse.json({ error: "canonical_name and category are required" }, { status: 400 });
  }

  const insertPayload = {
    ...payload,
    created_by: payload.created_by ?? payload.updated_by ?? actorEmail,
    updated_by: payload.updated_by ?? actorEmail,
  };

  const { data, error } = await supabase
    .from("materials")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    console.error("[materials/create]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("material_change_log").insert({
    material_id: data.id,
    entity_type: "material",
    entity_id: data.id,
    change_type: "create",
    new_value: data,
    changed_by: payload.updated_by ?? payload.created_by ?? actorEmail,
  });

  return NextResponse.json({ item: data }, { status: 201 });
}
