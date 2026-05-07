import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getQboAccessToken } from "@/lib/qbo-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QBO_REALM_ID = "9130350693918016";

interface QboTimeActivity {
  Id: string;
  EmployeeRef?: { name?: string; value?: string };
  CustomerRef?: { value?: string; name?: string };
  ItemRef?: { value?: string; name?: string };
  VendorRef?: { value?: string; name?: string };
  TxnDate?: string;
  Hours?: number;
  Minutes?: number;
  HourlyRate?: number;
  // Breaktime fields for OT detection
  BreakHours?: number;
  BreakMinutes?: number;
  StartTime?: string;
  EndTime?: string;
  Description?: string;
  NameOf?: string;
}

interface QboQueryResponse {
  QueryResponse?: {
    TimeActivity?: QboTimeActivity[];
    maxResults?: number;
    startPosition?: number;
    totalCount?: number;
  };
}

interface QboCustomerQueryResponse {
  QueryResponse?: {
    Customer?: Array<{
      Id: string;
      DisplayName: string;
      Job?: boolean;
    }>;
  };
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function qboFetch(url: string, accessToken: string, retries = 5): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (response.status === 429) {
      const backoff = Math.min(1000 * Math.pow(2, attempt), 30000);
      console.warn(`QBO rate limit (429), backing off ${backoff}ms (attempt ${attempt + 1}/${retries + 1})`);
      await sleep(backoff);
      continue;
    }
    return response;
  }
  throw new Error(`QBO request failed after ${retries + 1} attempts (persistent 429)`);
}

async function qboQuery<T>(accessToken: string, query: string): Promise<T> {
  const url = `https://quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}/query?query=${encodeURIComponent(query)}`;
  const response = await qboFetch(url, accessToken);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`QBO query failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

// Fetch ALL QBO sub-customers (jobs) with pagination and build a map: jobNumber -> customerId
async function getQboJobMap(accessToken: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const pageSize = 1000;
  let startPosition = 1;
  let keepFetching = true;

  while (keepFetching) {
    const data = await qboQuery<QboCustomerQueryResponse>(
      accessToken,
      `SELECT Id, DisplayName FROM Customer WHERE Job = true STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`
    );
    const customers = data.QueryResponse?.Customer ?? [];

    for (const customer of customers) {
      // QBO DisplayName formats: "26029-Kopari Beauty", "25207 - Versace", "MDP-63222 Deal"
      const match = customer.DisplayName.match(/(?:MDP-?)?(\d{4,6})\b/);
      if (match) {
        map.set(match[1], customer.Id);
      }
    }

    if (customers.length < pageSize) {
      keepFetching = false;
    } else {
      startPosition += pageSize;
    }
  }

  return map;
}

// Fetch time activity IDs for a customer, then fetch full records via REST
async function fetchTimeActivitiesForCustomer(
  accessToken: string,
  customerRefId: string
): Promise<QboTimeActivity[]> {
  // Step 1: get ALL IDs via paginated query
  const allSparse: QboTimeActivity[] = [];
  const pageSize = 1000;
  let startPosition = 1;
  let keepFetching = true;

  while (keepFetching) {
    const idQuery = `SELECT Id, TxnDate FROM TimeActivity WHERE CustomerRef = '${customerRefId}' STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
    const idData = await qboQuery<QboQueryResponse>(accessToken, idQuery);
    const page = idData.QueryResponse?.TimeActivity ?? [];
    allSparse.push(...page);
    if (page.length < pageSize) {
      keepFetching = false;
    } else {
      startPosition += pageSize;
    }
  }

  const sparse = allSparse;
  if (sparse.length === 0) return [];

  // Step 2: fetch full records in small parallel batches (3) to avoid QBO rate limits
  const fullActivities: QboTimeActivity[] = [];
  const batchSize = 3;

  for (let i = 0; i < sparse.length; i += batchSize) {
    const batch = sparse.slice(i, i + batchSize);
    const fetched = await Promise.all(
      batch.map(async (entry) => {
        const url = `https://quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}/timeactivity/${entry.Id}`;
        const res = await qboFetch(url, accessToken);
        if (!res.ok) return null;
        const data = await res.json() as { TimeActivity?: QboTimeActivity };
        return data.TimeActivity ?? null;
      })
    );
    fullActivities.push(...fetched.filter(Boolean) as QboTimeActivity[]);
    // Small pause between batches to stay under rate limit
    if (i + batchSize < sparse.length) await sleep(300);
  }

  return fullActivities;
}

function parseHoursMinutes(hours?: number, minutes?: number): number {
  return (hours ?? 0) + (minutes ?? 0) / 60;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const targetProjectId = (body as { projectId?: string }).projectId;

    const supabase = getSupabaseAdmin();

    // Get projects to sync
    let projectsQuery = supabase
      .from("projects")
      .select("id, job_number, status")
      .not("job_number", "is", null);

    if (targetProjectId) {
      projectsQuery = projectsQuery.eq("id", targetProjectId);
    }
    // Sync all projects (Active + Completed) — labor data needed for full history

    const { data: projects, error: projectsError } = await projectsQuery;
    if (projectsError) {
      return NextResponse.json({ error: "Failed to fetch projects", details: projectsError.message }, { status: 500 });
    }

    if (!projects || projects.length === 0) {
      return NextResponse.json({ synced: 0, projects: [], message: "No projects to sync" });
    }

    // Get QBO access token
    const accessToken = await getQboAccessToken();

    // Build job number -> QBO customer ID map
    const jobMap = await getQboJobMap(accessToken);

    const results: Array<{ projectId: string; jobNumber: string; synced: number; error?: string }> = [];
    let totalSynced = 0;

    for (const project of projects) {
      const jobNumber = project.job_number as string;
      const qboCustomerId = jobMap.get(jobNumber);

      if (!qboCustomerId) {
        results.push({ projectId: project.id, jobNumber, synced: 0, error: "No matching QBO sub-customer" });
        continue;
      }

      try {
        const activities = await fetchTimeActivitiesForCustomer(accessToken, qboCustomerId);

        const rows = activities
          .filter((a) => a.Id) // include all valid entries regardless of NameOf
          .map((a) => {
            const totalHours = parseHoursMinutes(a.Hours, a.Minutes);
            // Detect OT from ItemRef name (e.g. "DESIGN OVERTIME", "FIELD OVERTIME")
            const isOT = /overtime|OT/i.test(a.ItemRef?.name ?? "");
            return {
              project_id: project.id,
              employee_name: a.EmployeeRef?.name ?? a.VendorRef?.name ?? a.NameOf ?? "Unknown",
              date: a.TxnDate ?? new Date().toISOString().split("T")[0],
              reg_hours: isOT ? 0 : totalHours,
              ot_hours: isOT ? totalHours : 0,
              hourly_rate: a.HourlyRate ?? 30,
              qbo_entry_id: a.Id,
              synced_at: new Date().toISOString(),
            };
          });

        if (rows.length > 0) {
          for (let i = 0; i < rows.length; i += 100) {
            const batch = rows.slice(i, i + 100);
            const { error: upsertError } = await supabase
              .from("qbo_labor_entries")
              .upsert(batch, { onConflict: "qbo_entry_id" });

            if (upsertError) {
              throw new Error(`Upsert failed: ${upsertError.message}`);
            }
          }
        }

        results.push({ projectId: project.id, jobNumber, synced: rows.length });
        totalSynced += rows.length;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ projectId: project.id, jobNumber, synced: 0, error: message });
      }
    }

    return NextResponse.json({ synced: totalSynced, projects: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("QBO Labor Sync error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
