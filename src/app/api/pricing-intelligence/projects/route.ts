import { NextRequest, NextResponse } from "next/server";

import { requireProjectAdmin } from "@/lib/project-portfolio-server";

function parsePositiveNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function GET(request: NextRequest) {
  const admin = await requireProjectAdmin(request);
  if (!admin.ok) return admin.response;

  const params = request.nextUrl.searchParams;
  const projectType = params.get("project_type")?.trim();
  const contractMin = parsePositiveNumber(params.get("contract_min"));
  const contractMax = parsePositiveNumber(params.get("contract_max"));
  const requestedLimit = parsePositiveNumber(params.get("limit"));
  const limit = Math.min(Math.max(Math.floor(requestedLimit ?? 25), 1), 100);

  const requestedOffset = parsePositiveNumber(params.get("offset"));
  const offset = Math.floor(requestedOffset ?? 0);
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(offset + limit - 1)) {
    return NextResponse.json({ error: "Invalid offset" }, { status: 400 });
  }

  let query = admin.supabase
    .from("project_pricing_index")
    .select("*")
    .order("close_date", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (projectType) query = query.eq("project_type", projectType);
  if (contractMin !== null) query = query.gte("contract_amount", contractMin);
  if (contractMax !== null) query = query.lte("contract_amount", contractMax);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data ?? [], limit, offset });
}
