import { NextRequest, NextResponse } from "next/server";

import { normalizeAliasText, requireMaterialsAdmin } from "@/lib/materials/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedSorts = ["canonical_name", "category", "updated_at", "default_price", "active"] as const;

// GET /api/materials/search
export async function GET(req: NextRequest) {
  const auth = await requireMaterialsAdmin();
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  const { searchParams } = new URL(req.url);

  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category")?.trim() ?? "";
  const vendorId = searchParams.get("vendor_id")?.trim() ?? "";
  const active = searchParams.get("active")?.trim() ?? "active";
  const sort = searchParams.get("sort") ?? "canonical_name";
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const safeSort = allowedSorts.includes(sort as (typeof allowedSorts)[number]) ? sort : "canonical_name";

  let query = supabase
    .from("materials")
    .select(
      `
        id,
        canonical_name,
        category,
        subcategory,
        dimensions,
        thickness_text,
        base_unit,
        default_vendor_id,
        default_price,
        sku_or_code,
        finish,
        notes,
        active,
        updated_at,
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
        )
      `,
      { count: "exact" }
    );

  if (q) {
    const normalizedQuery = q.replace(/\s+/g, " ").trim();
    const aliasQuery = normalizeAliasText(normalizedQuery);
    const { data: aliasRows } = await supabase
      .from("material_aliases")
      .select("material_id")
      .ilike("normalized_alias_text", `%${aliasQuery}%`)
      .limit(100);

    const aliasMaterialIds = Array.from(new Set((aliasRows ?? []).map((row: { material_id?: string | null }) => row.material_id).filter(Boolean)));
    const aliasFilter = aliasMaterialIds.length > 0 ? `id.in.(${aliasMaterialIds.join(",")})` : null;
    query = query.or(
      [
        `canonical_name.ilike.%${normalizedQuery}%`,
        `category.ilike.%${normalizedQuery}%`,
        `dimensions.ilike.%${normalizedQuery}%`,
        `thickness_text.ilike.%${normalizedQuery}%`,
        `sku_or_code.ilike.%${normalizedQuery}%`,
        `search_text.ilike.%${normalizedQuery}%`,
        aliasFilter,
      ].filter(Boolean).join(",")
    );
  }

  if (category) query = query.eq("category", category);
  if (vendorId) query = query.eq("default_vendor_id", vendorId);
  if (active === "active") query = query.eq("active", true);
  if (active === "inactive") query = query.eq("active", false);

  query = query.order(safeSort, { ascending: order === "asc" }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("[materials/search]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? []).map((item: { material_vendor_prices?: Array<{ is_current?: boolean | null }> } & Record<string, unknown>) => {
    const currentPrices = (item.material_vendor_prices ?? []).filter((priceRow: { is_current?: boolean | null }) => priceRow.is_current);

    return {
      ...item,
      material_vendor_prices: currentPrices,
      current_price_count: currentPrices.length,
    };
  });

  return NextResponse.json({ items, total: count ?? 0, limit, offset });
}
