import { NextRequest, NextResponse } from "next/server";

import { requireMaterialsAdmin } from "@/lib/materials/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireMaterialsAdmin();
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20", 10), 1), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);

  const { data, error, count } = await supabase
    .from("material_import_batches")
    .select("id, source_name, source_url, uploaded_by, status, summary, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = typeof count === "number" ? count : offset + (data?.length ?? 0);

  return NextResponse.json({
    batches: data ?? [],
    limit,
    offset,
    total,
    hasMore: offset + (data?.length ?? 0) < total,
  });
}
