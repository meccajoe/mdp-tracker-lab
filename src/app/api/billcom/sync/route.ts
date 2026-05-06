import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Bill Spend & Expense API (v3) — uses apiToken header, not legacy devKey/session auth
const API_TOKEN = process.env.BILLCOM_API_TOKEN!;
const BASE_URL = process.env.BILLCOM_BASE_URL ?? "https://gateway.prod.bill.com/connect";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface BillTransaction {
  uuid: string;
  transactionType: "CLEAR" | "AUTHORIZATION" | "DECLINE";
  amount: number;
  merchantName: string;
  occurredTime: string;
  updatedTime: string;
  userName: string;
  tags: Array<{
    tagType: { name: string };
    selectedTagValues: string[];
  }>;
}

interface TransactionListResponse {
  results: BillTransaction[];
  cursor?: string;
}

async function fetchTransactions(params: Record<string, string>): Promise<TransactionListResponse> {
  const url = new URL(`${BASE_URL}/v3/spend/transactions`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      apiToken: API_TOKEN,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bill.com API ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<TransactionListResponse>;
}

/** Parse job number from Project tag value like "26056-Good TV-Musgraves..." */
function parseJobNumber(projectTagValue: string): string | null {
  const match = projectTagValue.match(/^(\d+)-/);
  return match ? match[1] : null;
}

/** Get a named tag value from a transaction's tags array */
function getTag(tx: BillTransaction, tagName: string): string | null {
  const tag = tx.tags.find(t => t.tagType.name === tagName);
  return tag?.selectedTagValues?.[0] ?? null;
}

/**
 * Map Bill.com Spend & Expense category string to MDP COGS category name.
 *
 * Bill.com format: "COS - Production : COS - [Specific]" or legacy "500XXX COS - ..."
 * Specific part maps directly to MDP cogs_categories.name values.
 */
const BILLCOM_CATEGORY_MAP: Record<string, string> = {
  // Exact matches from Bill.com "COS - Production : COS - X" → MDP category name
  "Fabrication":                       "Fabrication",
  "Fab Supplies and Small Equipment":  "Fab Supplies and Small Equipment",
  "Graphics":                          "Graphics",
  "Graphics Supplies":                 "Fab Supplies and Small Equipment",
  "Design Labor":                      "Design Labor",
  "Design":                            "Design",
  "Production Labor":                  "Production Labor",
  "Install/Strike":                    "Install/Strike",
  "On-site Show Services":             "On-site Show Services",
  "Shipping/Trucking":                 "Shipping/Trucking",
  "Fuel Costs":                        "Fuel Costs",
  "Storage":                           "Storage",
  "Travel-Hotels":                     "Travel-Hotels",
  "Travel-Per Diem":                   "Travel-Per Diem",
  "Travel-Airfare & Baggage Fees":     "Travel-Airfare & Baggage Fees",
  "Travel":                            "Travel",
  "Rental":                            "Rental",
  "Forklifts and Trucks":              "Forklifts and Trucks",
  "Show Prep":                         "Show Prep",
  "Production Meals":                  "Production Meals",
  "Machinery Repairs & Maintenance":   "Machinery Repairs & Maintenance",
  "Props/Decor":                       "Props/Decor",
  "I&D Labor":                         "I&D Labor",
  // Generic/unresolved fallback
  "Administration":                    "Fabrication",
  "Other":                             "Fabrication",
};

function mapCategory(billCategory: string | null): string {
  if (!billCategory) return "Fabrication";

  // Extract specific part from "COS - Production : COS - [Specific]"
  const colonMatch = billCategory.match(/:\s*COS\s*-\s*(.+)$/);
  const specific = colonMatch ? colonMatch[1].trim() : billCategory.trim();

  // Strip leading numeric codes like "500600 COS - Production : COS - Graphics"
  const stripped = specific.replace(/^\d+\s+/, "");

  return BILLCOM_CATEGORY_MAP[stripped] ?? BILLCOM_CATEGORY_MAP[specific] ?? "Fabrication";
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
    // Load MDP projects → Map<job_number, project_id>
    const { data: projects } = await supabase
      .from("projects")
      .select("id, job_number")
      .not("job_number", "is", null);

    const projectByJobNumber = new Map<string, string>();
    for (const p of projects ?? []) {
      if (p.job_number) projectByJobNumber.set(String(p.job_number), p.id);
    }

    // Get last sync watermark
    const { data: syncState } = await supabase
      .from("billcom_sync_state")
      .select("last_bill_updated_time")
      .eq("id", 1)
      .single();

    const lastUpdatedTime = syncState?.last_bill_updated_time ?? null;

    // Fetch all pages of CLEAR (settled) transactions
    const allTransactions: BillTransaction[] = [];
    const params: Record<string, string> = {
      pageSize: "200",
      transactionType: "CLEAR",
    };

    // Incremental: filter by updatedTime; first run pulls last 90 days
    if (lastUpdatedTime) {
      params.updatedTimeStart = lastUpdatedTime;
    } else {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      params.updatedTimeStart = ninetyDaysAgo.toISOString();
    }

    // Paginate via cursor
    let cursor: string | undefined;
    do {
      if (cursor) params.cursor = cursor;
      const page = await fetchTransactions(params);
      allTransactions.push(...page.results);
      cursor = page.cursor;
    } while (cursor);

    // Track latest updatedTime seen
    let maxUpdatedTime = lastUpdatedTime ?? "";

    for (const tx of allTransactions) {
      if (tx.updatedTime > maxUpdatedTime) {
        maxUpdatedTime = tx.updatedTime;
      }

      // Must have a Project tag
      const projectTagValue = getTag(tx, "Project");
      if (!projectTagValue) {
        skipped++;
        continue;
      }

      const jobNumber = parseJobNumber(projectTagValue);
      if (!jobNumber) {
        errors.push(`Transaction ${tx.uuid}: couldn't parse job number from "${projectTagValue}"`);
        skipped++;
        continue;
      }

      const projectId = projectByJobNumber.get(jobNumber);
      if (!projectId) {
        // Not an MDP project we track — skip silently
        skipped++;
        continue;
      }

      const billCategory = getTag(tx, "Category");
      const category = mapCategory(billCategory);
      const notesTag = getTag(tx, "Notes");
      const vendorTag = getTag(tx, "MDP Vendor") ?? tx.merchantName;

      const notes = [
        notesTag ?? null,
        billCategory ? `Bill.com category: ${billCategory}` : null,
        `Cardholder: ${tx.userName}`,
      ]
        .filter(Boolean)
        .join(" | ");

      const date = tx.occurredTime.split("T")[0];

      const { error } = await supabase.from("expenses").upsert(
        {
          id: randomUUID(),
          project_id: projectId,
          date,
          category,
          vendor: vendorTag,
          amount: tx.amount,
          notes,
          source: "billcom",
          external_id: tx.uuid,
          synced_at: new Date().toISOString(),
          amount_pending: false,
          purchaser: null,
        },
        { onConflict: "external_id" }
      );

      if (error) {
        errors.push(`Failed to upsert ${tx.uuid}: ${error.message}`);
      } else {
        synced++;
      }
    }

    // Update sync state
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
