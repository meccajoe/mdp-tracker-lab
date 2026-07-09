import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getSupabaseAdmin, requireMaterialsAdmin } from "@/lib/materials/server";
import { getQboAccessToken } from "@/lib/qbo-auth";
import { buildLiveWipRow } from "@/lib/wip-report";
import {
  buildCachedQboProjectWipMetricRow,
  buildProjectProfitabilitySummaryUrl,
  buildQboProjectWipMetrics,
  CachedQboProjectWipMetricRow,
  canServeHistoricalWipCache,
} from "@/lib/qbo-project-wip";
import { parseProjectProfitabilitySummaryRow, QboProjectProfitabilityRow } from "@/lib/qbo-project-profitability";
import { ProjectSummary } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QBO_REALM_ID = "9130350693918016";
const ALL_TIME_START_DATE = "2000-01-01";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function fetchProjectProfitabilityMap(accessToken: string, startDate: string, endDate: string) {
  const url = buildProjectProfitabilitySummaryUrl({
    realmId: QBO_REALM_ID,
    startDate,
    endDate,
  });

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`QBO ProjectProfitabilitySummary fetch failed (${res.status})`);
  }

  const data = (await res.json()) as {
    Rows?: {
      Row?: Array<{
        ColData?: Array<{ value?: string | null }>;
      }>;
    };
  };

  const map = new Map<string, QboProjectProfitabilityRow>();
  for (const row of data.Rows?.Row ?? []) {
    const parsed = parseProjectProfitabilitySummaryRow(row);
    if (!parsed) continue;
    map.set(parsed.jobNumber, parsed);
  }

  return map;
}

function buildRowsFromCachedMetrics(projects: ProjectSummary[], cachedMetricsByProjectId: Map<string, CachedQboProjectWipMetricRow>) {
  return projects.map((project) => buildLiveWipRow(project, cachedMetricsByProjectId.get(project.id) ?? null));
}

async function requireWipAdmin(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  const bearer = authHeader?.replace(/^Bearer\s+/i, "").trim() || "";

  if (bearer) {
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(bearer);

    if (authError || !user?.email) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
      };
    }

    const supabase = getSupabaseAdmin();
    const { data: roleRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("email", user.email.toLowerCase())
      .maybeSingle();

    if (roleError) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: roleError.message }, { status: 500 }),
      };
    }

    if (roleRow?.role !== "admin") {
      return {
        ok: false as const,
        response: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
      };
    }

    return {
      ok: true as const,
      supabase,
      actorEmail: user.email.toLowerCase(),
    };
  }

  return requireMaterialsAdmin();
}

export async function GET(request: NextRequest) {
  const admin = await requireWipAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const asOfDate = request.nextUrl.searchParams.get("asOfDate") ?? new Date().toISOString().slice(0, 10);
  if (!isIsoDate(asOfDate)) {
    return NextResponse.json({ error: "Invalid asOfDate. Expected YYYY-MM-DD." }, { status: 400 });
  }

  const currentYearStartDate = `${asOfDate.slice(0, 4)}-01-01`;
  const todayIso = new Date().toISOString().slice(0, 10);

  const { data: projects, error } = await admin.supabase
    .from("project_summary")
    .select("*")
    .order("client")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const typedProjects = (projects ?? []) as ProjectSummary[];

  const { data: cachedMetricsRows, error: cachedMetricsError } = await admin.supabase
    .from("qbo_project_wip_metrics")
    .select("*")
    .eq("as_of_date", asOfDate);

  if (cachedMetricsError) {
    return NextResponse.json({ error: cachedMetricsError.message }, { status: 500 });
  }

  const typedCachedMetricsRows = (cachedMetricsRows ?? []) as CachedQboProjectWipMetricRow[];
  const cachedMetricsByProjectId = new Map(typedCachedMetricsRows.map((row) => [row.project_id, row]));

  if (canServeHistoricalWipCache({
    asOfDate,
    todayIso,
    cachedRowCount: typedCachedMetricsRows.length,
    projectCount: typedProjects.length,
  })) {
    return NextResponse.json({
      asOfDate,
      cached: true,
      rows: buildRowsFromCachedMetrics(typedProjects, cachedMetricsByProjectId),
    });
  }

  try {
    const accessToken = await getQboAccessToken();
    const [allTimeMap, currentYearMap] = await Promise.all([
      fetchProjectProfitabilityMap(accessToken, ALL_TIME_START_DATE, asOfDate),
      fetchProjectProfitabilityMap(accessToken, currentYearStartDate, asOfDate),
    ]);

    const cacheRows = typedProjects.map((project) => {
      const allTimeRow = project.job_number ? allTimeMap.get(project.job_number) ?? null : null;
      const currentYearRow = project.job_number ? currentYearMap.get(project.job_number) ?? null : null;
      const metrics = buildQboProjectWipMetrics({ allTimeRow, currentYearRow });

      return buildCachedQboProjectWipMetricRow({
        projectId: project.id,
        asOfDate,
        metrics,
      });
    });

    const { error: upsertError } = await admin.supabase
      .from("qbo_project_wip_metrics")
      .upsert(cacheRows, { onConflict: "project_id,as_of_date" });

    if (upsertError) {
      throw upsertError;
    }

    const rows = buildRowsFromCachedMetrics(typedProjects, new Map(cacheRows.map((row) => [row.project_id, row])));

    return NextResponse.json({ asOfDate, cached: false, rows });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to build live WIP report." },
      { status: 500 },
    );
  }
}
