import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { getQboAccessToken } from "@/lib/qbo-auth";
import { getDealQuote, getQuoteLineItems } from "@/lib/hubspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min for full backfill

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY!;
const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID ?? "23392178";
const QBO_REALM_ID = "9130350693918016";
const BASE_HS_URL = "https://api.hubapi.com";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// ─── HubSpot helpers ────────────────────────────────────────────────────────

async function hsFetch(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_HS_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${HUBSPOT_API_KEY}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot error ${res.status} for ${path}: ${text}`);
  }
  return res.json();
}

interface HsDeal {
  id: string;
  properties: {
    dealname?: string;
    closedate?: string;
    job_number?: string;
    dealstage?: string;
  };
}

async function getAllHubSpotDeals(): Promise<HsDeal[]> {
  const deals: HsDeal[] = [];
  let after: string | undefined;

  // Filter: closedate >= 2023-01-01, all pipeline stages (closed won, closed lost, everything)
  const JAN_2023_MS = new Date("2023-01-01T00:00:00Z").getTime();

  while (true) {
    const body: Record<string, unknown> = {
      filterGroups: [
        {
          filters: [
            { propertyName: "closedate", operator: "GTE", value: String(JAN_2023_MS) },
          ],
        },
      ],
      properties: ["dealname", "closedate", "job_number", "dealstage"],
      limit: 100,
    };
    if (after) body.after = after;

    const res = await fetch(`${BASE_HS_URL}/crm/v3/objects/deals/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HubSpot deal search error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      results?: HsDeal[];
      paging?: { next?: { after?: string } };
    };
    deals.push(...(data.results ?? []));
    after = data.paging?.next?.after;
    if (!after) break;
    await sleep(150);
  }
  return deals;
}

// ─── QBO helpers ─────────────────────────────────────────────────────────────

interface QboLineItem {
  Id: string;
  LineNum?: number;
  Description?: string;
  Amount?: number;
  DetailType?: string;
  SalesItemLineDetail?: {
    ItemRef?: { value?: string; name?: string };
    Qty?: number;
    UnitPrice?: number;
  };
}

interface QboInvoice {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  CustomerRef?: { value?: string; name?: string };
  Line?: QboLineItem[];
}

async function qboFetch(url: string, accessToken: string): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 429) {
      await sleep(Math.min(1000 * Math.pow(2, attempt), 15000));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`QBO error ${res.status}: ${text}`);
    }
    return res.json();
  }
  throw new Error("QBO persistent 429");
}

async function qboQuery<T>(accessToken: string, sql: string): Promise<T> {
  const url = `https://quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}/query?query=${encodeURIComponent(sql)}&minorversion=70`;
  const data = (await qboFetch(url, accessToken)) as { QueryResponse?: T };
  return (data.QueryResponse ?? {}) as T;
}

// ─── Upsert helpers ──────────────────────────────────────────────────────────

interface LineItemRow {
  source: "hubspot" | "qbo";
  source_id: string;
  source_ref: string | null;
  source_date: string | null;
  project_id: string | null;
  project_name: string | null;
  sku: string | null;
  description: string | null;
  unit_cost: number | null;
  quantity: number | null;
  line_total: number | null;
  vendor: string | null;
  line_key: string;
  synced_at: string;
}

function makeLineKey(sku: string | null, description: string | null): string {
  const raw = `${sku ?? ""}|${description ?? ""}`;
  return createHash("md5").update(raw).digest("hex").slice(0, 16);
}

async function upsertLineItems(
  supabase: SupabaseClient,
  rows: LineItemRow[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await supabase
    .from("quote_line_items")
    .upsert(rows, {
      onConflict: "source,source_id,line_key",
      ignoreDuplicates: false,
    });

  if (error) {
    console.error("[line-items/sync] upsert error:", error);
  }
  return rows.length;
}

// ─── HubSpot sync ────────────────────────────────────────────────────────────

async function syncHubSpotDeal(
  supabase: SupabaseClient,
  deal: HsDeal,
  projectLookup: Map<string, { id: string; name: string }>
): Promise<number> {
  const dealId = deal.id;
  const dealName = deal.properties.dealname ?? "";
  const closeDate = deal.properties.closedate?.slice(0, 10) ?? null;

  let quoteId: string | null;
  try {
    quoteId = await getDealQuote(dealId, dealName);
  } catch (e) {
    console.warn(`[hs-sync] Could not get quote for deal ${dealId}: ${e}`);
    return 0;
  }
  if (!quoteId) return 0;

  let lineItems;
  try {
    lineItems = await getQuoteLineItems(quoteId);
  } catch (e) {
    console.warn(`[hs-sync] Could not get line items for quote ${quoteId}: ${e}`);
    return 0;
  }
  if (!lineItems.length) return 0;

  const project = projectLookup.get(dealId);
  const now = new Date().toISOString();

  const rows: LineItemRow[] = lineItems.map((item) => ({
    source: "hubspot",
    source_id: quoteId!,
    source_ref: deal.properties.job_number ?? dealName,
    source_date: closeDate,
    project_id: project?.id ?? null,
    project_name: project?.name ?? dealName,
    sku: item.sku || null,
    description: item.name || item.description || null,
    unit_cost: item.unit_price ?? null,
    quantity: item.quantity ?? null,
    line_total: item.amount ?? null,
    vendor: null,
    line_key: makeLineKey(item.sku || null, item.name || item.description || null),
    synced_at: now,
  }));

  return upsertLineItems(supabase, rows);
}

// ─── QBO sync ────────────────────────────────────────────────────────────────

async function syncQboInvoices(supabase: SupabaseClient): Promise<number> {
  const accessToken = await getQboAccessToken();
  const now = new Date().toISOString();
  let total = 0;
  let startPos = 1;
  const pageSize = 100;

  while (true) {
    const sql = `SELECT * FROM Invoice STARTPOSITION ${startPos} MAXRESULTS ${pageSize}`;
    const result = await qboQuery<{ Invoice?: QboInvoice[]; maxResults?: number }>(
      accessToken,
      sql
    );
    const invoices = result.Invoice ?? [];
    if (!invoices.length) break;

    const rows: LineItemRow[] = [];

    for (const inv of invoices) {
      const invoiceId = inv.Id;
      const docNumber = inv.DocNumber ?? null;
      const txnDate = inv.TxnDate ?? null;
      const customerName = inv.CustomerRef?.name ?? null;

      for (const line of inv.Line ?? []) {
        if (line.DetailType !== "SalesItemLineDetail") continue;
        const detail = line.SalesItemLineDetail;
        const sku = detail?.ItemRef?.value ?? null;
        const itemName = detail?.ItemRef?.name ?? null;
        const description = line.Description || itemName || null;

        rows.push({
          source: "qbo",
          source_id: invoiceId,
          source_ref: docNumber,
          source_date: txnDate,
          project_id: null, // QBO invoices don't map to a project FK cleanly
          project_name: customerName,
          sku,
          description,
          unit_cost: detail?.UnitPrice ?? null,
          quantity: detail?.Qty ?? null,
          line_total: line.Amount ?? null,
          vendor: null,
          line_key: makeLineKey(sku, description),
          synced_at: now,
        });
      }
    }

    total += await upsertLineItems(supabase, rows);
    startPos += pageSize;
    if (invoices.length < pageSize) break;
    await sleep(200);
  }

  return total;
}

// ─── Route handler ───────────────────────────────────────────────────────────

// POST /api/line-items/sync
// Body: { source?: "hubspot" | "qbo" | "all", dealId?: string }
// source defaults to "all" for full backfill
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();

  let body: { source?: string; dealId?: string } = {};
  try {
    body = await req.json();
  } catch (_) {
    // no body is fine
  }

  const source = body.source ?? "all";
  const singleDealId = body.dealId ?? null;

  const results: Record<string, number | string> = {};

  try {
    // ── HubSpot sync ──
    if (source === "hubspot" || source === "all") {
      // Build project lookup: dealId -> { id, name }
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name, hubspot_deal_id")
        .not("hubspot_deal_id", "is", null);

      const projectLookup = new Map<string, { id: string; name: string }>();
      for (const p of projects ?? []) {
        if (p.hubspot_deal_id) {
          projectLookup.set(p.hubspot_deal_id, { id: p.id, name: p.name });
        }
      }

      if (singleDealId) {
        // Sync one deal
        const data = (await hsFetch(
          `/crm/v3/objects/deals/${singleDealId}?properties=dealname,closedate,job_number`
        )) as HsDeal;
        results.hubspot = await syncHubSpotDeal(supabase, data, projectLookup);
      } else {
        // Full backfill
        const deals = await getAllHubSpotDeals();
        let hsTotal = 0;
        for (const deal of deals) {
          try {
            hsTotal += await syncHubSpotDeal(supabase, deal, projectLookup);
          } catch (e) {
            console.warn(`[hs-sync] deal ${deal.id} failed: ${e}`);
          }
          await sleep(50); // rate limit courtesy
        }
        results.hubspot = hsTotal;
      }
    }

    // ── QBO sync ──
    if (source === "qbo" || source === "all") {
      try {
        results.qbo = await syncQboInvoices(supabase);
      } catch (e) {
        results.qbo_error = String(e);
        console.error("[qbo-sync] failed:", e);
      }
    }

    return NextResponse.json({ ok: true, synced: results });
  } catch (e) {
    console.error("[line-items/sync]", e);
    return NextResponse.json(
      { error: String(e) },
      { status: 500 }
    );
  }
}

// GET /api/line-items/sync — trigger a sync for a single HubSpot deal (from webhook)
// ?dealId=123
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId");
  if (!dealId) {
    return NextResponse.json({ error: "dealId required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("hubspot_deal_id", dealId)
    .single();

  const projectLookup = new Map<string, { id: string; name: string }>();
  if (project) projectLookup.set(dealId, { id: project.id, name: project.name });

  try {
    const deal = (await hsFetch(
      `/crm/v3/objects/deals/${dealId}?properties=dealname,closedate,job_number`
    )) as HsDeal;
    const count = await syncHubSpotDeal(supabase, deal, projectLookup);
    return NextResponse.json({ ok: true, synced: count });
  } catch (e) {
    console.error("[line-items/sync GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
