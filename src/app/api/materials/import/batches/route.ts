import { NextRequest, NextResponse } from "next/server";

import { requireMaterialsAdmin } from "@/lib/materials/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireMaterialsAdmin();
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  const { data, error } = await supabase
    .from("material_import_batches")
    .select("id, source_name, source_url, uploaded_by, status, summary, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ batches: data ?? [] });
}
