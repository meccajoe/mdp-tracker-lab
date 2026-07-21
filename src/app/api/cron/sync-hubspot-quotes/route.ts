import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getDeal, getDealCompany, getDealQuote, getQuoteLineItems } from "@/lib/hubspot";
import { parseLineItems, type ParsedQuote } from "@/lib/hubspot-quote-parser";
import { buildHubspotQuoteSyncFields, stripUnsupportedProjectFields } from "@/lib/project-rebaseline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID?.trim() || null;

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

type HubspotLinkedProjectRow = {
  id: string;
  hubspot_deal_id: string | null;
  hubspot_quote_id: string | null;
  client: string | null;
};

function buildHubspotDealUrl(dealId: string) {
  return HUBSPOT_PORTAL_ID
    ? `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/deal/${dealId}`
    : `https://app.hubspot.com/contacts/deal/${dealId}`;
}

function emptyParsedQuote(contractAmount: number): ParsedQuote {
  return {
    contractAmount,
    quotes: {
      fabrication: 0,
      design: 0,
      pm: 0,
      shipping: 0,
      crating: 0,
      id_labor: 0,
      travel: 0,
      storage: 0,
      props: 0,
      equipment: 0,
      rental: 0,
      flooring: 0,
    },
    reclassified: [],
  };
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get("projectId")?.trim() || null;
  const dealIdFilter = request.nextUrl.searchParams.get("dealId")?.trim() || null;
  const limitParam = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : null;

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("projects")
    .select("id, hubspot_deal_id, hubspot_quote_id, client")
    .not("hubspot_deal_id", "is", null)
    .order("id", { ascending: true });

  if (projectId) {
    query = query.eq("id", projectId);
  }

  if (dealIdFilter) {
    query = query.eq("hubspot_deal_id", dealIdFilter);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[cron/sync-hubspot-quotes] Failed to load HubSpot-linked projects:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const projects = (data ?? []) as HubspotLinkedProjectRow[];
  const results: Array<{
    projectId: string;
    dealId: string | null;
    status: "updated" | "skipped" | "error";
    quoteId?: string | null;
    contractAmount?: number | null;
    error?: string;
  }> = [];

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const project of projects) {
    if (!project.hubspot_deal_id) {
      skipped += 1;
      results.push({ projectId: project.id, dealId: null, status: "skipped", error: "missing_hubspot_deal_id" });
      continue;
    }

    const dealId = String(project.hubspot_deal_id);

    try {
      const deal = await getDeal(dealId);

      let companyName = project.client ?? "Unknown";
      try {
        companyName = await getDealCompany(dealId);
      } catch (error) {
        console.error(`[cron/sync-hubspot-quotes] Failed to fetch company for deal ${dealId}:`, error);
      }

      let parsed = emptyParsedQuote(parseFloat(deal.properties.amount ?? "0") || 0);
      const quoteId = await getDealQuote(
        dealId,
        deal.properties.dealname ?? undefined,
        project.hubspot_quote_id,
      );

      if (!quoteId) {
        skipped += 1;
        results.push({ projectId: project.id, dealId, status: "skipped", error: "missing_quote" });
        continue;
      }

      const lineItems = await getQuoteLineItems(quoteId);
      if (lineItems.length === 0) {
        skipped += 1;
        results.push({ projectId: project.id, dealId, status: "skipped", quoteId, error: "missing_quote_line_items" });
        continue;
      }

      const fromLineItems = parseLineItems(lineItems);
      parsed = {
        ...fromLineItems,
        contractAmount: fromLineItems.contractAmount > 0 ? fromLineItems.contractAmount : parsed.contractAmount,
      };

      const quoteSyncFields = buildHubspotQuoteSyncFields(parsed);
      const updatePayload = stripUnsupportedProjectFields({
        name: deal.properties.dealname,
        client: companyName,
        close_date: deal.properties.closedate || null,
        due_date: deal.properties.due_date || null,
        contract_amount: parsed.contractAmount || null,
        hubspot_deal_id: dealId,
        hubspot_deal_url: buildHubspotDealUrl(dealId),
        ...quoteSyncFields,
      });

      const { error: updateError } = await supabase
        .from("projects")
        .update(updatePayload)
        .eq("id", project.id);

      if (updateError) {
        throw updateError;
      }

      updated += 1;
      results.push({
        projectId: project.id,
        dealId,
        status: "updated",
        quoteId,
        contractAmount: parsed.contractAmount || null,
      });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[cron/sync-hubspot-quotes] Failed to refresh project ${project.id}:`, error);
      results.push({ projectId: project.id, dealId, status: "error", error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: projects.length,
    updated,
    skipped,
    failed,
    results,
  });
}
