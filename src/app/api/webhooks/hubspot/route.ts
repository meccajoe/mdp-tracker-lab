// HubSpot webhook endpoint — auto-creates a project on Closed Won deals
//
// Required env vars:
//   HUBSPOT_API_KEY          - HubSpot private app PAT token (already set)
//   HUBSPOT_WEBHOOK_SECRET   - Simple secret token for validating incoming requests
//                             (add as query param in HubSpot Workflow URL: ?secret=TOKEN)
//   HUBSPOT_CLIENT_SECRET    - HubSpot app client secret (only needed for native webhook subscriptions)
//   HUBSPOT_PORTAL_ID        - HubSpot portal/account ID (for building deal URLs)
//   SLACK_WEBHOOK_URL        - Slack incoming webhook URL for project notifications
//   NEXT_PUBLIC_SUPABASE_URL - Already set
//   SUPABASE_SERVICE_ROLE_KEY - Already set

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { getDeal, getDealCompany, getDealQuote, getQuoteLineItems } from "@/lib/hubspot";
import { parseLineItems, calculateBudgets, type ParsedQuote, type CalculatedBudgets } from "@/lib/hubspot-quote-parser";
import { HARDCODED_DEFAULT_PCTS } from "@/lib/budget-formula";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
const HUBSPOT_WEBHOOK_SECRET = process.env.HUBSPOT_WEBHOOK_SECRET;
const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID ?? "";
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SLACK_BOT_TOKEN = process.env.MDP_SLACK_BOT_TOKEN;
const SLACK_NOTIFY_CHANNEL = process.env.SLACK_NOTIFY_CHANNEL;

const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000; // 5 minutes

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ---------------------------------------------------------------------------
// Signature validation
// ---------------------------------------------------------------------------

function validateSignature(req: NextRequest, body: string): boolean {
  if (!HUBSPOT_CLIENT_SECRET) {
    console.warn("[hubspot webhook] HUBSPOT_CLIENT_SECRET not set — skipping signature validation (dev mode)");
    return true;
  }

  const signature = req.headers.get("x-hubspot-signature-v3");
  const timestampHeader = req.headers.get("x-hubspot-signature-timestamp");

  if (!signature || !timestampHeader) {
    console.error("[hubspot webhook] Missing signature headers");
    return false;
  }

  const timestamp = parseInt(timestampHeader, 10);
  if (isNaN(timestamp) || Date.now() - timestamp > MAX_TIMESTAMP_AGE_MS) {
    console.error("[hubspot webhook] Timestamp too old or invalid");
    return false;
  }

  const url = req.url;
  const method = req.method;
  const hashInput = method + url + body + timestampHeader;
  const expected = createHmac("sha256", HUBSPOT_CLIENT_SECRET)
    .update(hashInput)
    .digest("base64");

  return signature === expected;
}

// ---------------------------------------------------------------------------
// Payload shapes
// ---------------------------------------------------------------------------

// Native webhook subscription format (array of events)
interface HubSpotWebhookEvent {
  subscriptionType?: string;
  objectId?: number;
  propertyName?: string;
  propertyValue?: string;
  portalId?: number;
}

// HubSpot Workflow HTTP action format (single object)
interface HubSpotWorkflowPayload {
  dealId?: string | number;
  objectId?: string | number;
  hs_object_id?: string | number;
  portalId?: string | number;
}

// ---------------------------------------------------------------------------
// Slack notification
// ---------------------------------------------------------------------------

function fmt(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}

async function postSlackNotification(
  projectId: string,
  projectName: string,
  client: string,
  contractAmount: number,
  parsed: ParsedQuote,
  budgets: CalculatedBudgets,
  reclassified: ParsedQuote["reclassified"]
) {
  const pcts = HARDCODED_DEFAULT_PCTS;
  const q = parsed.quotes;

  const lines: string[] = [
    `✅ *New project created:* ${projectName}`,
    `Client: ${client} | PM: TBD | Contract: ${fmt(contractAmount)}`,
    `Due: Not set`,
    ``,
    `*Budget snapshot:*`,
    `• Labor: ${budgets.budget_hrs ?? 0} hrs / ${fmt(Math.round(contractAmount * pcts.labor / 100))} (${pcts.labor}%)`,
    `• Materials: ${fmt(Math.round(contractAmount * pcts.materials / 100))} (${pcts.materials}%)`,
  ];

  const categories: Array<{ label: string; quoteVal: number; budgetVal: number | null; pct: number }> = [
    { label: "Design", quoteVal: q.design, budgetVal: budgets.budget_design, pct: pcts.design },
    { label: "PM", quoteVal: q.pm, budgetVal: budgets.budget_pm, pct: pcts.pm },
    { label: "Shipping", quoteVal: q.shipping, budgetVal: budgets.budget_shipping, pct: pcts.shipping },
    { label: "I&D Labor", quoteVal: q.id_labor, budgetVal: budgets.budget_id_labor, pct: pcts.id_labor },
    { label: "Travel", quoteVal: q.travel, budgetVal: budgets.budget_travel, pct: pcts.travel },
    { label: "Props/Decor", quoteVal: q.props, budgetVal: budgets.budget_props, pct: pcts.props },
    { label: "Equipment", quoteVal: q.equipment, budgetVal: budgets.budget_equipment, pct: pcts.equipment },
    { label: "Flooring", quoteVal: q.flooring, budgetVal: budgets.budget_flooring, pct: pcts.flooring },
  ];

  for (const cat of categories) {
    if (cat.quoteVal > 0) {
      lines.push(`• ${cat.label}: ${fmt(cat.quoteVal)} → ${fmt(cat.budgetVal ?? 0)} (${cat.pct}%)`);
    }
  }

  if (reclassified.length > 0) {
    const items = reclassified.map((r) => `"${r.name}" (${r.originalSku} → ${r.toCategory})`).join(", ");
    lines.push(``, `⚠️ ${reclassified.length} item${reclassified.length > 1 ? "s" : ""} reclassified: ${items}`);
  }

  lines.push(``, `View project → https://projects.meccanics.com/projects/${projectId}`);

  const text = lines.join("\n");

  // Prefer bot token + channel (supports DMs), fall back to incoming webhook
  if (SLACK_BOT_TOKEN && SLACK_NOTIFY_CHANNEL) {
    try {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Authorization": `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel: SLACK_NOTIFY_CHANNEL, text, mrkdwn: true }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) console.error("[hubspot webhook] Slack error:", data.error);
    } catch (err) {
      console.error("[hubspot webhook] Slack notification error:", err);
    }
  } else if (SLACK_WEBHOOK_URL) {
    try {
      const res = await fetch(SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) console.error("[hubspot webhook] Slack webhook failed:", res.status);
    } catch (err) {
      console.error("[hubspot webhook] Slack notification error:", err);
    }
  } else {
    console.log("[hubspot webhook] No Slack config — message:\n" + text);
  }
}

// ---------------------------------------------------------------------------
// Main POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const body = await req.text();
  const url = new URL(req.url);

  // --- Auth ---
  // Requests from localhost (mecca-qbo-poll running on the same machine) are
  // trusted without a secret. External requests validate via secret query param
  // or native HubSpot signature.
  const forwarded = req.headers.get("x-forwarded-for");
  const remoteIp = forwarded?.split(",")[0].trim() ?? "";
  const isLocalRequest = remoteIp === "127.0.0.1" || remoteIp === "::1" || remoteIp === "";

  if (!isLocalRequest) {
    const querySecret = url.searchParams.get("secret");
    if (querySecret !== null) {
      // External caller using secret token
      if (HUBSPOT_WEBHOOK_SECRET && querySecret !== HUBSPOT_WEBHOOK_SECRET) {
        console.error("[hubspot webhook] Invalid secret token");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      // Native HubSpot webhook subscription signature
      if (!validateSignature(req, body)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    console.error("[hubspot webhook] Failed to parse body:", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Normalize to array of { dealId, portalId } regardless of format
  let dealEvents: Array<{ dealId: number; portalId?: number }>;

  if (Array.isArray(parsed)) {
    // Native webhook subscription format
    const events = parsed as HubSpotWebhookEvent[];
    dealEvents = events
      .filter(
        (e) =>
          e.subscriptionType === "deal.propertyChange" &&
          e.propertyName === "dealstage" &&
          e.propertyValue === "closedwon" &&
          e.objectId != null
      )
      .map((e) => ({ dealId: e.objectId!, portalId: e.portalId }));
  } else {
    // HubSpot Workflow format — single object with dealId/objectId
    const wf = parsed as HubSpotWorkflowPayload;
    const rawId = wf.dealId ?? wf.objectId ?? wf.hs_object_id;
    const dealId = rawId != null ? Number(rawId) : NaN;
    if (isNaN(dealId)) {
      console.error("[hubspot webhook] Workflow payload missing dealId/objectId/hs_object_id");
      return NextResponse.json({ error: "Missing dealId" }, { status: 400 });
    }
    const portalId = wf.portalId != null ? Number(wf.portalId) : undefined;
    dealEvents = [{ dealId, portalId }];
  }

  if (dealEvents.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const supabase = getSupabaseAdmin();
  const results: Array<{ dealId: number; status: string }> = [];

  for (const event of dealEvents) {
    const dealId = event.dealId;
    const portalId = event.portalId ? String(event.portalId) : HUBSPOT_PORTAL_ID;

    try {
      // Idempotency check
      const { data: existing } = await supabase
        .from("projects")
        .select("id")
        .eq("hubspot_deal_id", String(dealId))
        .maybeSingle();

      if (existing) {
        console.log(`[hubspot webhook] Deal ${dealId} already has a project (${existing.id}), skipping`);
        results.push({ dealId, status: "skipped" });
        continue;
      }

      // Fetch deal
      const deal = await getDeal(String(dealId));

      // Fetch company name
      let companyName = "Unknown";
      try {
        companyName = await getDealCompany(String(dealId));
      } catch (err) {
        console.error(`[hubspot webhook] Failed to fetch company for deal ${dealId}:`, err);
      }

      // Fetch quote + line items, falling back gracefully
      let parsed: ParsedQuote = {
        contractAmount: parseFloat(deal.properties.amount ?? "0") || 0,
        quotes: { design: 0, pm: 0, shipping: 0, id_labor: 0, travel: 0, props: 0, equipment: 0, flooring: 0 },
        reclassified: [],
      };

      try {
        const quoteId = await getDealQuote(String(dealId));
        if (quoteId) {
          const lineItems = await getQuoteLineItems(quoteId);
          if (lineItems.length > 0) {
            const fromLineItems = parseLineItems(lineItems);
            // Use line item contractAmount; keep deal.amount as fallback if zero
            parsed = {
              ...fromLineItems,
              contractAmount: fromLineItems.contractAmount > 0 ? fromLineItems.contractAmount : parsed.contractAmount,
            };
          }
        }
      } catch (err) {
        console.error(`[hubspot webhook] Failed to fetch quote/line items for deal ${dealId}:`, err);
        // parsed already has contractAmount from deal.amount
      }

      const budgets = await calculateBudgets(parsed);

      // Determine job number / project ID
      const rawJobNumber = deal.properties.job_number?.trim();
      const jobNumber = rawJobNumber || `HS-${dealId}`;

      const hubspotDealUrl = portalId
        ? `https://app.hubspot.com/contacts/${portalId}/deal/${dealId}`
        : `https://app.hubspot.com/contacts/deal/${dealId}`;

      const insertPayload = {
        id: jobNumber,
        job_number: jobNumber,
        name: deal.properties.dealname,
        client: companyName,
        pm: "TBD",
        status: "Active",
        close_date: deal.properties.closedate || null,
        due_date: null,
        contract_amount: parsed.contractAmount || null,
        hubspot_deal_id: String(dealId),
        hubspot_deal_url: hubspotDealUrl,
        notes: null,
        quote_labor: null,
        quote_materials: null,
        quote_design: parsed.quotes.design || null,
        quote_pm: parsed.quotes.pm || null,
        quote_shipping: parsed.quotes.shipping || null,
        quote_id_labor: parsed.quotes.id_labor || null,
        quote_travel: parsed.quotes.travel || null,
        quote_props: parsed.quotes.props || null,
        quote_equipment: parsed.quotes.equipment || null,
        quote_flooring: parsed.quotes.flooring || null,
        budget_hrs: budgets.budget_hrs,
        budget_materials: budgets.budget_materials,
        budget_design: budgets.budget_design,
        budget_pm: budgets.budget_pm,
        budget_shipping: budgets.budget_shipping,
        budget_id_labor: budgets.budget_id_labor,
        budget_travel: budgets.budget_travel,
        budget_props: budgets.budget_props,
        budget_equipment: budgets.budget_equipment,
        budget_flooring: budgets.budget_flooring,
        pct_labor: null,
        pct_materials: null,
        pct_design: null,
        pct_pm: null,
        pct_shipping: null,
        pct_id_labor: null,
        pct_travel: null,
        pct_props: null,
        pct_equipment: null,
        pct_flooring: null,
      };

      const { error: insertError } = await supabase.from("projects").insert(insertPayload);
      if (insertError) {
        console.error(`[hubspot webhook] Failed to insert project for deal ${dealId}:`, insertError);
        results.push({ dealId, status: "error" });
        continue;
      }

      console.log(`[hubspot webhook] Created project ${jobNumber} for deal ${dealId}`);

      // Post Slack notification (non-blocking)
      postSlackNotification(
        jobNumber,
        deal.properties.dealname,
        companyName,
        parsed.contractAmount,
        parsed,
        budgets,
        parsed.reclassified
      ).catch((err) => console.error("[hubspot webhook] Slack error:", err));

      results.push({ dealId, status: "created" });
    } catch (err) {
      console.error(`[hubspot webhook] Unhandled error for deal ${dealId}:`, err);
      results.push({ dealId, status: "error" });
    }
  }

  const anySkipped = results.some((r) => r.status === "skipped");
  if (results.length === 1 && anySkipped) {
    return NextResponse.json({ skipped: true });
  }

  return NextResponse.json({ ok: true, results });
}
