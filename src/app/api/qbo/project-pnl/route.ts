import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getQboAccessToken } from "@/lib/qbo-auth";

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

// Fetch P&L for a specific QBO customer (project) using the Reports API
async function fetchProjectPnL(
  accessToken: string,
  qboProjectId: string
): Promise<{ income: number; expenses: number; netIncome: number } | null> {
  const url = `https://quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}/reports/ProfitAndLoss?customer=${qboProjectId}&summarize_column_by=Total&minorversion=70`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });

  if (!res.ok) {
    console.error(`QBO P&L fetch failed for ${qboProjectId}: ${res.status}`);
    return null;
  }

  const data = await res.json() as {
    Rows?: {
      Row?: Array<{
        group?: string;
        Summary?: { ColData?: Array<{ value?: string }> };
        Rows?: { Row?: Array<{ ColData?: Array<{ value?: string }>; group?: string }> };
      }>;
    };
  };

  let income = 0;
  let expenses = 0;

  for (const row of data.Rows?.Row ?? []) {
    const group = row.group ?? "";
    const summaryVal = parseFloat(row.Summary?.ColData?.[1]?.value ?? "0") || 0;

    if (group === "Income") income = summaryVal;
    else if (group === "Expenses" || group === "CostOfGoodsSold" || group === "OtherExpenses") {
      expenses += summaryVal;
    }
  }

  return { income, expenses, netIncome: income - expenses };
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
      .select("id, name, qbo_project_id, contract_amount, total_spent")
      .not("qbo_project_id", "is", null);

    if (projectId) query.eq("id", projectId);

    const { data: projects, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!projects?.length) return NextResponse.json({ synced: 0 });

    let synced = 0;
    const results = [];

    for (const project of projects) {
      const pnl = await fetchProjectPnL(accessToken, project.qbo_project_id!);
      if (!pnl) continue;

      const { error: upsertErr } = await supabase
        .from("qbo_project_pnl")
        .upsert({
          project_id: project.id,
          qbo_income: pnl.income,
          qbo_expenses: pnl.expenses,
          qbo_net_income: pnl.netIncome,
          synced_at: new Date().toISOString(),
        }, { onConflict: "project_id" });

      if (!upsertErr) {
        synced++;
        results.push({ id: project.id, name: project.name, ...pnl });
      }

      // Brief pause to avoid QBO rate limits
      await new Promise((r) => setTimeout(r, 200));
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
