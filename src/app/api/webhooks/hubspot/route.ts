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
import { createHmac, createHash } from "crypto";
import { getDeal, getDealCompany, getDealQuote, getQuoteLineItems, resolveHubSpotProjectManagerInitials, type HubSpotLineItem } from "@/lib/hubspot";
import { parseLineItems, type ParsedQuote, type CalculatedBudgets } from "@/lib/hubspot-quote-parser";
import { syncPmStartingPortfolioMembership } from "@/lib/project-auto-portfolio-membership";
import { HARDCODED_DEFAULT_PCTS } from "@/lib/budget-formula";
import { buildHubspotQuoteSyncFields, stripUnsupportedProjectFields } from "@/lib/project-rebaseline";
import { buildBillBudgetDescription, buildBillBudgetName, calculateBillManagedBudgetTotal, resolveBillSpendMemberEmail, seedBillBudgetForProject, shouldSeedBillBudget, updateBillBudgetForProject } from "@/lib/billcom-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
const HUBSPOT_WEBHOOK_SECRET = process.env.HUBSPOT_WEBHOOK_SECRET;
const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID ?? "";
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SLACK_BOT_TOKEN = process.env.MDP_SLACK_BOT_TOKEN;
const PROJECT_NOTIFICATION_SLACK_BOT_TOKEN = process.env.PROJECT_NOTIFICATION_SLACK_BOT_TOKEN ?? SLACK_BOT_TOKEN;
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
  reclassified: ParsedQuote["reclassified"],
  projectPm: string,
  dealId: number,
  portalId: string
) {
  const pcts = HARDCODED_DEFAULT_PCTS;
  const q = parsed.quotes;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://projects.meccadesign.com";
  const hubspotUrl = `https://app-na2.hubspot.com/contacts/${portalId || "23392178"}/deal/${dealId}`;

  // Budget lines — only show categories with a non-zero quote amount
  const budgetLines: string[] = [
    `• Labor: ${budgets.budget_hrs ?? 0} hrs / ${fmt(Math.round(contractAmount * pcts.labor / 100))} (${pcts.labor}%)`,
    `• Materials: ${fmt(Math.round(contractAmount * pcts.materials / 100))} (${pcts.materials}%)`,
  ];
  const categories: Array<{ label: string; quoteVal: number; budgetVal: number | null; pct: number }> = [
    { label: "Design",      quoteVal: q.design,    budgetVal: budgets.budget_design,    pct: pcts.design },
    { label: "PM",          quoteVal: q.pm,        budgetVal: budgets.budget_pm,        pct: pcts.pm },
    { label: "Shipping",    quoteVal: q.shipping,  budgetVal: budgets.budget_shipping,  pct: pcts.shipping },
    { label: "Crating",     quoteVal: q.crating,   budgetVal: budgets.budget_crating,   pct: pcts.crating },
    { label: "I&D Labor",   quoteVal: q.id_labor,  budgetVal: budgets.budget_id_labor,  pct: pcts.id_labor },
    { label: "Travel",      quoteVal: q.travel,    budgetVal: budgets.budget_travel,    pct: pcts.travel },
    { label: "Props/Decor", quoteVal: q.props,     budgetVal: budgets.budget_props,     pct: pcts.props },
    { label: "Equipment",   quoteVal: q.equipment, budgetVal: budgets.budget_equipment, pct: pcts.equipment },
    { label: "Flooring",    quoteVal: q.flooring,  budgetVal: budgets.budget_flooring,  pct: pcts.flooring },
  ];
  for (const cat of categories) {
    if (cat.quoteVal > 0) {
      budgetLines.push(`• ${cat.label}: ${fmt(cat.quoteVal)} → ${fmt(cat.budgetVal ?? 0)} (${cat.pct}%)`);
    }
  }

  const text = `✅ New project created: ${projectName} | ${client} | ${fmt(contractAmount)}`;

  const blocks: object[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "✅ New Project Created", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Project*\n<${siteUrl}/projects/${projectId}|${projectName}>` },
        { type: "mrkdwn", text: `*Job #*\n${projectId}` },
        { type: "mrkdwn", text: `*Client*\n${client}` },
        { type: "mrkdwn", text: `*Contract*\n${fmt(contractAmount)}` },
        { type: "mrkdwn", text: `*PM*\n${projectPm}` },
        { type: "mrkdwn", text: `*Due Date*\nNot set` },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Budget Snapshot*\n${budgetLines.join("\n")}` },
    },
    ...(reclassified.length > 0 ? [{
      type: "section",
      text: {
        type: "mrkdwn",
        text: `⚠️ *${reclassified.length} item${reclassified.length > 1 ? "s" : ""} reclassified:* ${reclassified.map((r) => `"${r.name}" (${r.originalSku} → ${r.toCategory})`).join(", ")}`,
      },
    }] : []),
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "📋 View Project", emoji: true },
          url: `${siteUrl}/projects/${projectId}`,
          action_id: "view_mdp_project",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "💼 View Deal", emoji: true },
          url: hubspotUrl,
          action_id: "view_hs_deal",
        },
      ],
    },
  ];

  // Dedicated notification token preserves delivery to the established Ada group DM.
  if (PROJECT_NOTIFICATION_SLACK_BOT_TOKEN && SLACK_NOTIFY_CHANNEL) {
    try {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Authorization": `Bearer ${PROJECT_NOTIFICATION_SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel: SLACK_NOTIFY_CHANNEL, text, blocks }),

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
        body: JSON.stringify({ text, blocks }),
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
// Line item sync (called non-blocking from the main webhook handler)
// ---------------------------------------------------------------------------

function makeLineKey(sku: string | null, description: string | null): string {
  const raw = `${sku ?? ""}|${description ?? ""}`;
  return createHash("md5").update(raw).digest("hex").slice(0, 16);
}

async function syncLineItemsForDeal(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  dealId: string,
  quoteId: string,
  deal: Awaited<ReturnType<typeof getDeal>>,
  lineItems: HubSpotLineItem[]
): Promise<void> {
  if (!lineItems.length) return;

  // Resolve project_id via hubspot_deal_id lookup
  const projectRes = await supabaseAdmin
    .from("projects")
    .select("id, name")
    .eq("hubspot_deal_id", dealId)
    .maybeSingle();

  const projectId: string | null = (projectRes.data as { id: string } | null)?.id ?? null;
  const projectName: string | null = (projectRes.data as { name: string } | null)?.name ?? null;

  const now = new Date().toISOString();
  const dealName = deal.properties.dealname ?? "";
  const jobNumber = deal.properties.job_number?.trim() || null;
  const closeDate = deal.properties.closedate?.slice(0, 10) ?? null;

  const rows = lineItems.map((item) => ({
    source: "hubspot" as const,
    source_id: quoteId,
    source_ref: jobNumber ?? dealName,
    source_date: closeDate,
    project_id: projectId,
    project_name: projectName ?? dealName,
    sku: item.sku || null,
    description: item.name || item.description || null,
    unit_cost: item.unit_price ?? null,
    quantity: item.quantity ?? null,
    line_total: item.amount ?? null,
    vendor: null as string | null,
    hubspot_deal_id: String(dealId),
    line_key: makeLineKey(item.sku || null, item.name || item.description || null),
    synced_at: now,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin as any)
    .from("quote_line_items")
    .upsert(rows, { onConflict: "source,source_id,line_key" });

  if (error) {
    console.error(`[hubspot webhook] line_items upsert error for deal ${dealId}:`, error);
  } else {
    console.log(`[hubspot webhook] synced ${rows.length} line items for deal ${dealId}`);
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
      // Upsert path: existing HubSpot-linked project should be refreshed, not skipped.
      const { data: existing } = await supabase
        .from("projects")
        .select("id, bill_budget_uuid, pm, hubspot_quote_id")
        .eq("hubspot_deal_id", String(dealId))
        .maybeSingle();

      // Fetch deal
      const deal = await getDeal(String(dealId));

      const { data: pmRoles, error: pmRolesError } = await supabase
        .from("user_roles")
        .select("full_name, pm_initials")
        .not("pm_initials", "is", null);
      if (pmRolesError) {
        console.error(`[hubspot webhook] Failed to load PM mapping for deal ${dealId}:`, pmRolesError);
      }
      const resolvedPmInitials = resolveHubSpotProjectManagerInitials(
        deal.properties.account_manager,
        pmRoles ?? [],
      );
      if (deal.properties.account_manager && !resolvedPmInitials) {
        console.error(
          `[hubspot webhook] Unmapped HubSpot account_manager for deal ${dealId}: ${deal.properties.account_manager}`,
        );
      }

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
        quotes: { fabrication: 0, design: 0, pm: 0, shipping: 0, crating: 0, id_labor: 0, travel: 0, storage: 0, props: 0, equipment: 0, rental: 0, flooring: 0 },
        reclassified: [],
      };

      try {
        const quoteId = await getDealQuote(
          String(dealId),
          deal.properties.dealname ?? undefined,
          existing?.hubspot_quote_id,
        );
        if (quoteId) {
          const lineItems = await getQuoteLineItems(quoteId);
          if (lineItems.length > 0) {
            const fromLineItems = parseLineItems(lineItems);
            // Use line item contractAmount; keep deal.amount as fallback if zero
            parsed = {
              ...fromLineItems,
              contractAmount: fromLineItems.contractAmount > 0 ? fromLineItems.contractAmount : parsed.contractAmount,
            };

            // Sync line items into quote_line_items table (non-blocking)
            syncLineItemsForDeal(supabase, String(dealId), quoteId, deal, lineItems)
              .catch((err) => console.error(`[hubspot webhook] line item sync failed for deal ${dealId}:`, err));
          }
        }
      } catch (err) {
        console.error(`[hubspot webhook] Failed to fetch quote/line items for deal ${dealId}:`, err);
        // parsed already has contractAmount from deal.amount
      }

      const quoteSyncFields = buildHubspotQuoteSyncFields(parsed);

      // Determine job number / project ID
      const rawJobNumber = deal.properties.job_number?.trim();
      const jobNumber = rawJobNumber || `HS-${dealId}`;

      const hubspotDealUrl = portalId
        ? `https://app.hubspot.com/contacts/${portalId}/deal/${dealId}`
        : `https://app.hubspot.com/contacts/deal/${dealId}`;

      const insertPayload = stripUnsupportedProjectFields({
        id: jobNumber,
        job_number: jobNumber,
        name: deal.properties.dealname,
        client: companyName,
        pm: resolvedPmInitials ?? "TBD",
        status: "Active",
        close_date: deal.properties.closedate || null,
        due_date: deal.properties.due_date || null,
        contract_amount: parsed.contractAmount || null,
        hubspot_deal_id: String(dealId),
        hubspot_deal_url: hubspotDealUrl,
        notes: null,
        ...quoteSyncFields,
        pct_labor: null,
        pct_materials: null,
        pct_design: null,
        pct_pm: null,
        pct_shipping: null,
        pct_crating: null,
        pct_id_labor: null,
        pct_travel: null,
        pct_storage: null,
        pct_props: null,
        pct_equipment: null,
        pct_rental: null,
        pct_flooring: null,
      });

      const budgetPreview = {
        budget_hrs: quoteSyncFields.budget_hrs,
        budget_materials: quoteSyncFields.budget_materials,
        budget_design: quoteSyncFields.budget_design,
        budget_pm: quoteSyncFields.budget_pm,
        budget_shipping: quoteSyncFields.budget_shipping,
        budget_crating: quoteSyncFields.budget_crating,
        budget_id_labor: quoteSyncFields.budget_id_labor,
        budget_travel: quoteSyncFields.budget_travel,
        budget_storage: quoteSyncFields.budget_storage,
        budget_props: quoteSyncFields.budget_props,
        budget_equipment: quoteSyncFields.budget_equipment,
        budget_rental: quoteSyncFields.budget_rental,
        budget_flooring: quoteSyncFields.budget_flooring,
      } as CalculatedBudgets;

      const billJobNameSnapshot = buildBillBudgetName({
        billJobName: null,
        jobNumber,
        projectName: deal.properties.dealname,
      });
      const billBudgetTotal = calculateBillManagedBudgetTotal({
        budget_travel: quoteSyncFields.budget_travel,
        budget_props: quoteSyncFields.budget_props,
      });
      const billBudgetDescriptionPreview = buildBillBudgetDescription({
        projectId: jobNumber,
        jobName: billJobNameSnapshot,
        travel: quoteSyncFields.budget_travel ?? 0,
        props: quoteSyncFields.budget_props ?? 0,
        total: billBudgetTotal,
        seededAt: new Date().toISOString().slice(0, 10),
      });

      const maybeSeedBillBudget = async (projectId: string, existingBillBudgetUuid: string | null, projectPm: string | null) => {
        const shouldCreateBillBudget = shouldSeedBillBudget({
          bill_budget_uuid: existingBillBudgetUuid,
          budget_travel: quoteSyncFields.budget_travel,
          budget_props: quoteSyncFields.budget_props,
        });

        let pmEmail: string | null = null;
        const pmInitials = projectPm && projectPm !== "TBD" ? projectPm : null;
        if (pmInitials) {
          const { data: pmRow } = await supabase
            .from("user_roles")
            .select("email, bill_spend_email")
            .eq("pm_initials", pmInitials)
            .maybeSingle();
          pmEmail = resolveBillSpendMemberEmail(pmRow);
        }

        if (!shouldCreateBillBudget) {
          if (existingBillBudgetUuid) {
            const syncResult = await updateBillBudgetForProject({
              budgetUuid: existingBillBudgetUuid,
              projectId,
              projectName: deal.properties.dealname,
              jobNumber,
              billJobName: billJobNameSnapshot,
              budgetTravel: quoteSyncFields.budget_travel ?? 0,
              budgetProps: quoteSyncFields.budget_props ?? 0,
              pmEmail,
            });

            await supabase
              .from("projects")
              .update({
                bill_job_name_snapshot: billJobNameSnapshot,
                bill_budget_total_snapshot: billBudgetTotal,
                bill_budget_name: syncResult.budgetName ?? billJobNameSnapshot,
                bill_budget_last_sync_status: syncResult.status,
                bill_budget_last_sync_error: syncResult.error ?? null,
              })
              .eq("id", projectId);
            return;
          }

          const skippedStatus = "no_bill_managed_budget_default";
          await supabase
            .from("projects")
            .update({
              bill_job_name_snapshot: billJobNameSnapshot,
              bill_budget_total_snapshot: billBudgetTotal,
              bill_budget_last_sync_status: skippedStatus,
              bill_budget_last_sync_error: null,
            })
            .eq("id", projectId);
          return;
        }

        const seedResult = await seedBillBudgetForProject({
          projectId,
          projectName: deal.properties.dealname,
          jobNumber,
          billJobName: billJobNameSnapshot,
          budgetTravel: quoteSyncFields.budget_travel ?? 0,
          budgetProps: quoteSyncFields.budget_props ?? 0,
          pmEmail,
        });

        const updatePayload: Record<string, string | number | null> = {
          bill_job_name_snapshot: billJobNameSnapshot,
          bill_budget_total_snapshot: billBudgetTotal,
          bill_budget_last_sync_status: seedResult.status,
          bill_budget_last_sync_error: seedResult.error ?? null,
        };

        if (seedResult.status === "created" || seedResult.status === "created_with_member_warning") {
          updatePayload.bill_budget_uuid = seedResult.budgetUuid ?? null;
          updatePayload.bill_budget_name = seedResult.budgetName ?? billJobNameSnapshot;
          updatePayload.bill_budget_seeded_at = new Date().toISOString();
          updatePayload.bill_budget_seed_source = "closed_won_webhook";
        }

        await supabase.from("projects").update(updatePayload).eq("id", projectId);
      };

      if (existing) {
        const existingProject = existing as { id: string; bill_budget_uuid: string | null; pm: string | null };
        const { id: _ignore, ...updatePayload } = insertPayload;
        if (existingProject.pm && existingProject.pm !== "TBD") {
          updatePayload.pm = existingProject.pm;
        }
        const { error: updateError } = await supabase.from("projects").update(updatePayload).eq("id", existingProject.id);
        if (updateError) {
          console.error(`[hubspot webhook] Failed to refresh project for deal ${dealId}:`, updateError);
          results.push({ dealId, status: "error" });
          continue;
        }
        const portfolioSync = await syncPmStartingPortfolioMembership({
          supabase,
          projectId: existingProject.id,
          pmInitials: typeof updatePayload.pm === "string" ? updatePayload.pm : null,
          status: typeof updatePayload.status === "string" ? updatePayload.status : null,
        });
        if (portfolioSync.error) {
          console.error(`[hubspot webhook] Failed to sync PM portfolio membership for project ${existingProject.id}:`, portfolioSync.error);
        }
        await maybeSeedBillBudget(existingProject.id, existingProject.bill_budget_uuid ?? null, updatePayload.pm ?? null);
        console.log(`[hubspot webhook] Refreshed project ${existingProject.id} for deal ${dealId}`);
        results.push({ dealId, status: "updated" });
        continue;
      }

      const { error: insertError } = await supabase.from("projects").insert(insertPayload);
      if (insertError) {
        console.error(`[hubspot webhook] Failed to insert project for deal ${dealId}:`, insertError);
        results.push({ dealId, status: "error" });
        continue;
      }

      const portfolioSync = await syncPmStartingPortfolioMembership({
        supabase,
        projectId: jobNumber,
        pmInitials: typeof insertPayload.pm === "string" ? insertPayload.pm : null,
        status: typeof insertPayload.status === "string" ? insertPayload.status : null,
      });
      if (portfolioSync.error) {
        console.error(`[hubspot webhook] Failed to sync PM portfolio membership for project ${jobNumber}:`, portfolioSync.error);
      }

      await maybeSeedBillBudget(jobNumber, null, insertPayload.pm ?? null);

      console.log(`[hubspot webhook] Created project ${jobNumber} for deal ${dealId}`);

      // Post Slack notification (non-blocking)
      postSlackNotification(
        jobNumber,
        deal.properties.dealname,
        companyName,
        parsed.contractAmount,
        parsed,
        budgetPreview,
        parsed.reclassified,
        deal.properties.account_manager?.trim() || (insertPayload.pm as string),
        dealId,
        portalId
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
