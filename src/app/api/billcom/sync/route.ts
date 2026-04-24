import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BASE_URL = process.env.BILLCOM_BASE_URL!;
const DEV_KEY = process.env.BILLCOM_DEV_KEY!;
const ORG_ID = process.env.BILLCOM_ORG_ID!;
const EMAIL = process.env.BILLCOM_EMAIL!;
const PASSWORD = process.env.BILLCOM_PASSWORD!;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function billcomPost(path: string, sessionId: string | null, params: Record<string, unknown>) {
  const body = new URLSearchParams();
  body.set("devKey", DEV_KEY);
  if (sessionId) body.set("sessionId", sessionId);
  body.set("data", JSON.stringify(params));

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bill.com ${path} failed (${res.status}): ${text}`);
  }

  const json = await res.json() as { response_status: number; response_message: string; response_data: unknown };
  if (json.response_status !== 0) {
    throw new Error(`Bill.com ${path} error ${json.response_status}: ${json.response_message}`);
  }
  return json.response_data;
}

async function login(): Promise<string> {
  const data = await billcomPost("/Login.json", null, {
    orgId: ORG_ID,
    userName: EMAIL,
    password: PASSWORD,
  }) as { sessionId: string };
  return data.sessionId;
}

async function fetchList<T>(sessionId: string, entity: string, filters: Record<string, unknown>[] = []): Promise<T[]> {
  const allItems: T[] = [];
  let start = 0;
  const max = 200;

  while (true) {
    const data = await billcomPost(`/List/${entity}.json`, sessionId, {
      start,
      max,
      filters,
    }) as T[];

    allItems.push(...data);
    if (data.length < max) break;
    start += max;
  }

  return allItems;
}

interface BillLineItem {
  id: string;
  billId: string;
  amount: number;
  description: string | null;
  jobId: string | null;
  customerId: string | null;
  chartOfAccountId: string | null;
}

interface Bill {
  id: string;
  vendorId: string;
  invoiceDate: string | null;
  isActive: string;
  updatedTime: string;
  billLineItems: BillLineItem[];
}

interface BillcomJob {
  id: string;
  name: string;
  isActive: string;
}

interface BillcomVendor {
  id: string;
  name: string;
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data: state } = await supabase
    .from("billcom_sync_state")
    .select("last_sync_at, last_bill_updated_time")
    .eq("id", 1)
    .single();

  const { count } = await supabase
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("source", "billcom");

  return NextResponse.json({
    last_sync_at: state?.last_sync_at ?? null,
    last_bill_updated_time: state?.last_bill_updated_time ?? null,
    billcom_expense_count: count ?? 0,
  });
}

export async function POST(_request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];
  let synced = 0;
  let skipped = 0;

  try {
    // Step 1: Login
    const sessionId = await login();

    // Step 2: Fetch jobs → Map<jobId, jobName>
    const jobs = await fetchList<BillcomJob>(sessionId, "Job", [{ field: "isActive", op: "=", value: "1" }]);
    const jobMap = new Map<string, string>();
    for (const job of jobs) {
      jobMap.set(job.id, job.name);
    }

    // Step 3: Fetch vendors → Map<vendorId, vendorName>
    const vendors = await fetchList<BillcomVendor>(sessionId, "Vendor", []);
    const vendorMap = new Map<string, string>();
    for (const vendor of vendors) {
      vendorMap.set(vendor.id, vendor.name);
    }

    // Step 4: Get last sync state
    const { data: syncState } = await supabase
      .from("billcom_sync_state")
      .select("last_bill_updated_time")
      .eq("id", 1)
      .single();

    const lastUpdatedTime = syncState?.last_bill_updated_time ?? null;

    // Build date filter — 90 days back on first run, else incremental
    const filters: Record<string, unknown>[] = [
      { field: "isActive", op: "=", value: "1" },
    ];
    if (lastUpdatedTime) {
      filters.push({ field: "updatedTime", op: ">=", value: lastUpdatedTime });
    } else {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      filters.push({ field: "updatedTime", op: ">=", value: ninetyDaysAgo.toISOString().split("T")[0] });
    }

    // Step 4: Fetch bills
    const bills = await fetchList<Bill>(sessionId, "Bill", filters);

    // Track the latest updatedTime we see
    let maxUpdatedTime = lastUpdatedTime ?? "";

    // Step 5: Load MDP projects → Map<job_number, project_id>
    const { data: projects } = await supabase
      .from("projects")
      .select("id, job_number")
      .not("job_number", "is", null);

    const projectByJobNumber = new Map<string, string>();
    for (const p of (projects ?? [])) {
      if (p.job_number) projectByJobNumber.set(p.job_number, p.id);
    }

    // Step 5: Process each bill line item
    for (const bill of bills) {
      if (bill.updatedTime > maxUpdatedTime) {
        maxUpdatedTime = bill.updatedTime;
      }

      const vendorName = vendorMap.get(bill.vendorId) ?? "Unknown";
      const invoiceDate = bill.invoiceDate ?? new Date().toISOString().split("T")[0];

      for (const lineItem of (bill.billLineItems ?? [])) {
        const jobId = lineItem.jobId ?? "";

        // Skip unassigned line items
        if (!jobId || jobId === "00000000000000000000") {
          skipped++;
          continue;
        }

        const jobName = jobMap.get(jobId);
        if (!jobName) {
          errors.push(`Bill ${bill.id} line ${lineItem.id}: jobId ${jobId} not found in jobs list`);
          skipped++;
          continue;
        }

        // jobName = MDP job number (e.g. "26001")
        const projectId = projectByJobNumber.get(jobName);
        if (!projectId) {
          // Not an MDP project — skip silently
          skipped++;
          continue;
        }

        // Upsert expense
        const { error } = await supabase.from("expenses").upsert(
          {
            project_id: projectId,
            date: invoiceDate,
            category: "Materials",
            vendor: vendorName,
            amount: lineItem.amount,
            notes: lineItem.description ?? null,
            source: "billcom",
            external_id: lineItem.id,
            synced_at: new Date().toISOString(),
            // Required non-null fields with defaults for billcom-sourced rows
            amount_pending: false,
            purchaser: null,
          },
          { onConflict: "external_id" }
        );

        if (error) {
          errors.push(`Failed to upsert line item ${lineItem.id}: ${error.message}`);
        } else {
          synced++;
        }
      }
    }

    // Step 6: Update sync state
    await supabase.from("billcom_sync_state").upsert({
      id: 1,
      last_sync_at: new Date().toISOString(),
      last_bill_updated_time: maxUpdatedTime || null,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ synced, skipped, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Bill.com sync error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
