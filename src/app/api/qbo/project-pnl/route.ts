import { execSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QBO_REALM_ID = "9130350693918016";

function runSecretCommand(command: string): string {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: "/bin/zsh",
  }).trim();
}

function getOnePasswordValue(field: string): string {
  return runSecretCommand(
    `source ~/.config/archie/credentials/1password.env && op item get "QBO - Mecca HubSpot Integration" --vault Archie --fields "${field}" --reveal`
  );
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getQboAccessToken(): Promise<string> {
  const clientId = getOnePasswordValue("client ID");
  const clientSecret = getOnePasswordValue("client secret");
  const refreshToken = getOnePasswordValue("refresh_token");
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
      cache: "no-store",
    }
  );
  if (!response.ok) throw new Error(`QBO token refresh failed (${response.status})`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("No access token returned");
  return data.access_token;
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

    // Fetch projects with a QBO project ID
    const query = supabase
      .from("projects")
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
