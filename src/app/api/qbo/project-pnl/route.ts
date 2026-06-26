import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getQboAccessToken } from "@/lib/qbo-auth";
import { parseProjectProfitabilitySummaryRow } from "@/lib/qbo-project-profitability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QBO_REALM_ID = "9130350693918016";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function fetchProjectProfitabilitySummary(
  accessToken: string
): Promise<Map<string, { projectName: string; income: number; costs: number; profit: number }>> {
  const url = `https://quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}/reports/ProjectProfitabilitySummary?minorversion=70`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
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

  const map = new Map<string, { projectName: string; income: number; costs: number; profit: number }>();
  for (const row of data.Rows?.Row ?? []) {
    const parsed = parseProjectProfitabilitySummaryRow(row);
    if (!parsed) continue;
    map.set(parsed.jobNumber, {
      projectName: parsed.projectName,
      income: parsed.income,
      costs: parsed.costs,
      profit: parsed.profit,
    });
  }

  return map;
}

// POST /api/qbo/project-pnl — sync P&L for one or all projects
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();

  // Auth check — service key only (called from admin UI or cron)
  const body = await req.json().catch(() => ({})) as { projectId?: string };
  const projectId = body.projectId ?? null; // null = sync all

  try {
    const accessToken = await getQboAccessToken();

    // Fetch projects with a QBO project ID (use view for computed fields)
    const query = supabase
      .from("project_summary")
      .select("id, name, job_number, qbo_project_id, qbo_project_url, contract_amount, total_spent")
      .not("qbo_project_id", "is", null);

    if (projectId) query.eq("id", projectId);

    const { data: projects, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!projects?.length) return NextResponse.json({ synced: 0 });

    let synced = 0;
    const results = [];
    const profitabilityByJobNumber = await fetchProjectProfitabilitySummary(accessToken);

    for (const project of projects) {
      const jobNumber = String(project.job_number ?? '').trim();
      if (!jobNumber) continue;

      const profitability = profitabilityByJobNumber.get(jobNumber);
      if (!profitability) continue;

      const { error: upsertErr } = await supabase
        .from("qbo_project_pnl")
        .upsert({
          project_id: project.id,
          qbo_income: profitability.income,
          qbo_expenses: profitability.costs,
          qbo_net_income: profitability.profit,
          synced_at: new Date().toISOString(),
        }, { onConflict: "project_id" });

      if (!upsertErr) {
        synced++;
        results.push({
          id: project.id,
          name: project.name,
          qbo_project_url: project.qbo_project_url,
          qbo_project_name: profitability.projectName,
          income: profitability.income,
          expenses: profitability.costs,
          netIncome: profitability.profit,
        });
      }
    }

    return NextResponse.json({ synced, results });
  } catch (err) {
    console.error("QBO P&L sync error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}
