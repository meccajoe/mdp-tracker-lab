import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getQboAccessToken } from "@/lib/qbo-auth";
import { buildQboProjectDetailsUrl, extractQboProjectDetailsId } from "@/lib/qbo-project-profitability";

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

async function findQboProjectByJobNumber(
  accessToken: string,
  jobNumber: string
): Promise<{ id: string; name: string } | null> {
  const query = 'query projectManagementProjects($first: PositiveInt!, $after: String, $filter: ProjectManagement_ProjectFilter!, $orderBy: [ProjectManagement_OrderBy!]) { projectManagementProjects(first: $first, after: $after, filter: $filter, orderBy: $orderBy) { edges { node { id name status } } pageInfo { hasNextPage endCursor } } }';
  let cursor: string | null = null;

  do {
    const variables: { first: number; filter: Record<string, never>; orderBy: string[]; after?: string } = {
      first: 100,
      filter: {},
      orderBy: ['DUE_DATE_DESC'],
    };
    if (cursor) variables.after = cursor;

    const res = await fetch('https://qb.api.intuit.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      throw new Error(`QBO project search failed (${res.status})`);
    }

    const data = (await res.json()) as {
      data?: {
        projectManagementProjects?: {
          edges?: Array<{ node?: { id?: string; name?: string | null } | null }>;
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        };
      };
    };

    const result = data.data?.projectManagementProjects;
    const match = (result?.edges ?? []).find((edge) => edge.node?.name?.startsWith(String(jobNumber)));
    if (match?.node?.id && match.node.name) {
      return { id: match.node.id, name: match.node.name };
    }

    cursor = result?.pageInfo?.hasNextPage ? result.pageInfo.endCursor ?? null : null;
  } while (cursor);

  return null;
}

// Fetch P&L for a specific QBO project using the Projects profitability filter
async function fetchProjectPnL(
  accessToken: string,
  qboProjectId: string
): Promise<{ income: number; expenses: number; netIncome: number } | null> {
  const url = `https://quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}/reports/ProfitAndLoss?project=${qboProjectId}&summarize_column_by=Total&minorversion=70`;

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
      .select("id, name, job_number, qbo_project_id, qbo_project_url, contract_amount, total_spent")
      .not("qbo_project_id", "is", null);

    if (projectId) query.eq("id", projectId);

    const { data: projects, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!projects?.length) return NextResponse.json({ synced: 0 });

    let synced = 0;
    const results = [];

    for (const project of projects) {
      let profitabilityProjectId = extractQboProjectDetailsId(project.qbo_project_url);
      let profitabilityProjectUrl = project.qbo_project_url;

      if (!profitabilityProjectId && project.job_number) {
        const foundProject = await findQboProjectByJobNumber(accessToken, String(project.job_number));
        if (foundProject?.id) {
          profitabilityProjectId = foundProject.id;
          profitabilityProjectUrl = buildQboProjectDetailsUrl(foundProject.id);

          await supabase
            .from("projects")
            .update({
              qbo_project_url: profitabilityProjectUrl,
            })
            .eq("id", project.id)
            .like("qbo_project_url", "%customerdetail%")
            .select("id");
        }
      }

      if (!profitabilityProjectId) continue;

      const pnl = await fetchProjectPnL(accessToken, profitabilityProjectId);
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
        results.push({ id: project.id, name: project.name, qbo_project_url: profitabilityProjectUrl, ...pnl });
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
