const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY!;
const BASE_URL = "https://api.hubapi.com";
const HUBSPOT_MIN_REQUEST_INTERVAL_MS = 150;
const HUBSPOT_MAX_RATE_LIMIT_RETRIES = 4;
let nextHubSpotRequestAt = 0;
let hubSpotPacingQueue: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function paceHubSpotRequest(): Promise<void> {
  let releaseQueue!: () => void;
  const previous = hubSpotPacingQueue;
  hubSpotPacingQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  await previous;

  const waitMs = Math.max(0, nextHubSpotRequestAt - Date.now());
  nextHubSpotRequestAt = Math.max(Date.now(), nextHubSpotRequestAt) + HUBSPOT_MIN_REQUEST_INTERVAL_MS;
  releaseQueue();
  if (waitMs > 0) await sleep(waitMs);
}

function retryAfterMs(value: string | null, attempt: number): number {
  const seconds = Number.parseFloat(value ?? "");
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  return Math.min(1000 * 2 ** attempt, 15000);
}

async function hubspotFetch(path: string): Promise<unknown> {
  for (let attempt = 0; attempt <= HUBSPOT_MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    await paceHubSpotRequest();
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (res.status === 429 && attempt < HUBSPOT_MAX_RATE_LIMIT_RETRIES) {
      await sleep(retryAfterMs(res.headers.get("Retry-After"), attempt));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HubSpot API error ${res.status} for ${path}: ${text}`);
    }
    return res.json();
  }

  throw new Error(`HubSpot API rate limit retries exhausted for ${path}`);
}

export function normalizeHubspotDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.includes("T") ? value.slice(0, 10) : value;
}

export interface HubSpotDeal {
  id: string;
  properties: {
    dealname: string;
    closedate: string | null;
    due_date: string | null;
    amount: string | null;
    hs_object_id: string;
    job_number: string | null;
    hs_is_closed_won: string | null;
  };
}

export interface HubSpotLineItem {
  id?: string;
  name: string;
  sku: string;
  description?: string;
  quantity?: number;
  unit_price?: number;
  amount: number;
  quote_position?: number;
}

export function sortHubspotLineItemsByQuotePosition(lineItems: HubSpotLineItem[]): HubSpotLineItem[] {
  return [...lineItems].sort((a, b) => {
    const aPos = a.quote_position;
    const bPos = b.quote_position;

    if (aPos == null && bPos == null) return 0;
    if (aPos == null) return 1;
    if (bPos == null) return -1;

    return aPos - bPos;
  });
}

export async function getDeal(dealId: string): Promise<HubSpotDeal> {
  const props = "dealname,closedate,due_date,amount,hs_object_id,job_number,hs_is_closed_won";
  const data = await hubspotFetch(
    `/crm/v3/objects/deals/${dealId}?properties=${props}`
  ) as HubSpotDeal;

  return {
    ...data,
    properties: {
      ...data.properties,
      closedate: normalizeHubspotDate(data.properties.closedate),
      due_date: normalizeHubspotDate(data.properties.due_date),
    },
  };
}

export async function getDealCompany(dealId: string): Promise<string> {
  const assocData = await hubspotFetch(
    `/crm/v3/objects/deals/${dealId}/associations/companies`
  ) as { results?: Array<{ id: string }> };

  const companyId = assocData.results?.[0]?.id;
  if (!companyId) return "Unknown";

  const company = await hubspotFetch(
    `/crm/v3/objects/companies/${companyId}?properties=name`
  ) as { properties?: { name?: string } };

  return company.properties?.name ?? "Unknown";
}

// ─── Quote selection: highest version ───────────────────────────────────────
// Mirrors the same logic in mecca-qbo/index.js.
//
// Naming convention (set by Paul in HubSpot):
//   [Deal Name]       → v1 (original)
//   [Deal Name v2]    → v2
//   [Deal Name v3]    → v3
//
// Always grab the highest version. Approval status is NOT a factor.

function getQuoteVersion(quoteName: string, dealName: string): number {
  if (quoteName === dealName) return 1;
  const escaped = dealName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Matches both formats Paul uses:
  //   "Deal Name v2"          (simple, no parens, end of string)
  //   "Deal Name (v2)"        (parenthetical, end of string)
  //   "Deal Name (v2) suffix" (parenthetical with description)
  const match = quoteName.match(
    new RegExp(`^${escaped}\\s+(?:\\(v(\\d+)\\)|v(\\d+))(?:\\s|$)`, 'i')
  );
  if (match) return parseInt(match[1] ?? match[2], 10);

  // Associated quotes can use a shortened title (for example `LIFEWTR (v3)`
  // for a deal called `LIFEWTR Tunnel`). Once the association scopes the
  // candidates to one deal, a generic version label remains authoritative.
  const genericVersion = quoteName.match(/\bv(\d+)\b/i);
  return genericVersion ? parseInt(genericVersion[1], 10) : 0;
}

export type HubSpotQuoteCandidate = {
  id: string;
  title: string;
  createdAt: string;
  amount: number | null;
};

export function selectDealQuote(candidates: HubSpotQuoteCandidate[], dealName?: string, preferredQuoteId?: string | null): HubSpotQuoteCandidate | null {
  if (candidates.length === 0) return null;

  if (preferredQuoteId) {
    const preferred = candidates.find((candidate) => candidate.id === preferredQuoteId);
    if (preferred) return preferred;
    console.warn(`[hubspot] Preferred quote ${preferredQuoteId} is not associated with deal; falling back to title-version selection.`);
  }

  if (candidates.length === 1 || !dealName) return candidates[0];
  const versioned = candidates
    .map((candidate) => ({ ...candidate, version: getQuoteVersion(candidate.title, dealName) }))
    .filter((candidate) => candidate.version > 0);
  if (versioned.length === 0) {
    return [...candidates].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }
  return versioned.sort((a, b) => b.version - a.version || b.createdAt.localeCompare(a.createdAt))[0];
}

export async function getDealQuote(dealId: string, dealName?: string, preferredQuoteId?: string | null): Promise<string | null> {
  const assocData = await hubspotFetch(
    `/crm/v3/objects/deals/${dealId}/associations/quotes`
  ) as { results?: Array<{ id: string }> };

  const refs = assocData.results ?? [];
  if (refs.length === 0) return null;

  // Fetch quote titles and dates for the established version heuristic; a project may
  // explicitly pin one associated quote when HubSpot contains a known split-scope exception.
  const quotes: HubSpotQuoteCandidate[] = await Promise.all(
    refs.map((r) =>
      hubspotFetch(`/crm/v3/objects/quotes/${r.id}?properties=hs_title,hs_createdate,hs_quote_amount`)
        .then((q) => {
          const properties = (q as { properties?: { hs_title?: string; hs_createdate?: string; hs_quote_amount?: string } }).properties;
          return {
            id: r.id,
            title: properties?.hs_title ?? "",
            createdAt: properties?.hs_createdate ?? "",
            amount: Number.parseFloat(properties?.hs_quote_amount ?? "") || null,
          };
        })
        .catch(() => ({ id: r.id, title: "", createdAt: "", amount: null }))
    )
  );

  const winner = selectDealQuote(quotes, dealName, preferredQuoteId);
  if (!winner) return null;
  console.log(`[hubspot] Selected quote "${winner.title}" (id: ${winner.id}) for "${dealName ?? dealId}"${preferredQuoteId ? " using the project quote override" : ""}`);
  return winner.id;
}

export async function getQuoteLineItems(quoteId: string): Promise<HubSpotLineItem[]> {
  const assocData = await hubspotFetch(
    `/crm/v3/objects/quotes/${quoteId}/associations/line_items`
  ) as { results?: Array<{ id: string }> };

  const lineItemIds = assocData.results?.map((r) => r.id) ?? [];
  if (lineItemIds.length === 0) return [];

  const props = "name,description,hs_sku,price,quantity,amount,hs_line_item_currency_code,hs_position_on_quote";
  const items = await Promise.all(
    lineItemIds.map((id) =>
      hubspotFetch(`/crm/v3/objects/line_items/${id}?properties=${props}`) as Promise<{
        id?: string;
        properties?: {
          name?: string;
          description?: string;
          hs_sku?: string;
          price?: string;
          quantity?: string;
          amount?: string;
          hs_position_on_quote?: string;
        };
      }>
    )
  );

  return sortHubspotLineItemsByQuotePosition(items.map((item, index) => ({
    id: item.id ?? lineItemIds[index],
    name: item.properties?.name ?? "",
    sku: item.properties?.hs_sku ?? "",
    description: item.properties?.description ?? "",
    quantity: parseFloat(item.properties?.quantity ?? "0") || 0,
    unit_price: parseFloat(item.properties?.price ?? "0") || 0,
    amount: parseFloat(item.properties?.amount ?? "0") || 0,
    quote_position: item.properties?.hs_position_on_quote
      ? Number(item.properties.hs_position_on_quote)
      : undefined,
  })));
}
