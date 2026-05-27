import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET /api/line-items/search
// Query params:
//   q          - full-text search query
//   job_number - prefix match on source_ref
//   year       - YYYY filter on source_date
//   project_name - case-insensitive contains on project_name
//   sort       - column to sort by (default: source_date)
//   order      - asc|desc (default: desc)
//   limit      - max results (default: 100, max: 500)
//   offset     - pagination offset
export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);

  const q = searchParams.get("q")?.trim() ?? "";
  const jobNumber = searchParams.get("job_number")?.trim() ?? "";
  const year = searchParams.get("year")?.trim() ?? "";
  const projectName = searchParams.get("project_name")?.trim() ?? "";
  const sort = searchParams.get("sort") ?? "source_date";
  const order = searchParams.get("order") === "asc" ? true : false; // ascending = true
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  // Allowed sort columns (whitelist to prevent injection)
  const allowedSorts = ["source_date", "sku", "description", "project_name", "unit_cost", "line_total", "source"];
  const safeSort = allowedSorts.includes(sort) ? sort : "source_date";

  let query = supabase
    .from("quote_line_items")
    .select(
      "id, source, source_id, source_ref, source_date, project_id, project_name, sku, description, unit_cost, quantity, line_total, vendor, synced_at, projects(hubspot_deal_id)",
      { count: "exact" }
    );

  // Full-text search: use Postgres FTS when q is provided
  if (q) {
    // Build a tsquery from the search terms — each word becomes a prefix search
    const tsQuery = q
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.replace(/[^a-zA-Z0-9]/g, "") + ":*")
      .join(" & ");

    if (tsQuery) {
      query = query.textSearch("raw_text", tsQuery, {
        type: "websearch",
        config: "english",
      });
    }
  }

  // Sidebar filters
  if (jobNumber) {
    query = query.ilike("source_ref", `${jobNumber}%`);
  }

  if (year) {
    const y = parseInt(year, 10);
    if (!isNaN(y)) {
      query = query
        .gte("source_date", `${y}-01-01`)
        .lte("source_date", `${y}-12-31`);
    }
  }

  if (projectName) {
    query = query.ilike("project_name", `%${projectName}%`);
  }

  query = query
    .order(safeSort, { ascending: order })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("[line-items/search]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [], total: count ?? 0, limit, offset });
}
