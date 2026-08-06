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
export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);

  const q = searchParams.get("q")?.trim() ?? "";
  const jobNumber = searchParams.get("job_number")?.trim() ?? "";
  const year = searchParams.get("year")?.trim() ?? "";
  const projectName = searchParams.get("project_name")?.trim() ?? "";
  const sort = searchParams.get("sort") ?? "source_date";
  const order = searchParams.get("order") === "asc" ? true : false;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const allowedSorts = ["source_date", "sku", "description", "project_name", "unit_cost", "line_total", "source"];
  const safeSort = allowedSorts.includes(sort) ? sort : "source_date";

  let query = supabase
    .from("quote_line_items")
    .select(
      "id, source, source_id, source_ref, source_date, project_id, project_name, sku, description, unit_cost, quantity, line_total, vendor, hubspot_deal_id, synced_at",
      { count: "exact" }
    );

  if (q) query = query.ilike("description", `%${q}%`);

  if (jobNumber) query = query.ilike("source_ref", `${jobNumber}%`);

  if (year) {
    const y = parseInt(year, 10);
    if (!isNaN(y)) {
      query = query.gte("source_date", `${y}-01-01`).lte("source_date", `${y}-12-31`);
    }
  }

  if (projectName) query = query.ilike("project_name", `%${projectName}%`);

  query = query.order(safeSort, { ascending: order }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("[line-items/search]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = data ?? [];
  const missingHubspotDealIds = items.filter(
    (item) => item.source === "hubspot" && !item.hubspot_deal_id && (item.project_id || item.source_ref)
  );

  if (missingHubspotDealIds.length > 0) {
    const projectIds = [...new Set(missingHubspotDealIds.map((item) => item.project_id).filter(Boolean))];
    const jobNumbers = [...new Set(missingHubspotDealIds.map((item) => item.source_ref).filter(Boolean))];

    let projectQuery = supabase
      .from("projects")
      .select("id, job_number, hubspot_deal_id")
      .not("hubspot_deal_id", "is", null);

    if (projectIds.length > 0 && jobNumbers.length > 0) {
      projectQuery = projectQuery.or(
        `id.in.(${projectIds.join(",")}),job_number.in.(${jobNumbers.map((job) => JSON.stringify(job)).join(",")})`
      );
    } else if (projectIds.length > 0) {
      projectQuery = projectQuery.in("id", projectIds);
    } else if (jobNumbers.length > 0) {
      projectQuery = projectQuery.in("job_number", jobNumbers);
    }

    const { data: projects, error: projectError } = await projectQuery;

    if (projectError) {
      console.error("[line-items/search:fallback]", projectError);
    } else if (projects?.length) {
      const dealByProjectId = new Map(projects.map((project) => [project.id, project.hubspot_deal_id]));
      const dealByJobNumber = new Map(projects.map((project) => [project.job_number, project.hubspot_deal_id]));

      for (const item of items) {
        if (item.source !== "hubspot" || item.hubspot_deal_id) continue;

        const dealId = (item.project_id ? dealByProjectId.get(item.project_id) : null)
          ?? (item.source_ref ? dealByJobNumber.get(item.source_ref) : null);

        if (dealId) {
          item.hubspot_deal_id = dealId;
        }
      }
    }
  }

  return NextResponse.json({ items, total: count ?? 0, limit, offset });
}
