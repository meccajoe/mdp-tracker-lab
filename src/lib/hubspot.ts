const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY!;
const BASE_URL = "https://api.hubapi.com";

async function hubspotFetch(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${HUBSPOT_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API error ${res.status} for ${path}: ${text}`);
  }
  return res.json();
}

export interface HubSpotDeal {
  id: string;
  properties: {
    dealname: string;
    closedate: string | null;
    amount: string | null;
    hs_object_id: string;
    job_number: string | null;
    hs_is_closed_won: string | null;
  };
}

export interface HubSpotLineItem {
  name: string;
  sku: string;
  amount: number;
}

export async function getDeal(dealId: string): Promise<HubSpotDeal> {
  const props = "dealname,closedate,amount,hs_object_id,job_number,hs_is_closed_won";
  const data = await hubspotFetch(
    `/crm/v3/objects/deals/${dealId}?properties=${props}`
  ) as HubSpotDeal;
  return data;
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
  const match = quoteName.match(new RegExp(`^${escaped}\\s+v(\\d+)$`, 'i'));
  return match ? parseInt(match[1], 10) : 0;
}

export async function getDealQuote(dealId: string, dealName?: string): Promise<string | null> {
  const assocData = await hubspotFetch(
    `/crm/v3/objects/deals/${dealId}/associations/quotes`
  ) as { results?: Array<{ id: string }> };

  const refs = assocData.results ?? [];
  if (refs.length === 0) return null;
  if (refs.length === 1 || !dealName) return refs[0].id;

  // Fetch hs_title for each quote so we can pick the highest version
  const quotes = await Promise.all(
    refs.map((r) =>
      hubspotFetch(`/crm/v3/objects/quotes/${r.id}?properties=hs_title`)
        .then((q) => ({
          id: r.id,
          title: ((q as { properties?: { hs_title?: string } }).properties?.hs_title ?? ""),
        }))
        .catch(() => ({ id: r.id, title: "" }))
    )
  );

  const versioned = quotes
    .map((q) => ({ id: q.id, version: getQuoteVersion(q.title, dealName) }))
    .filter((v) => v.version > 0);

  if (versioned.length === 0) {
    // Naming didn't match — fall back to last in list (most recently created)
    console.warn(`[hubspot] No version-matched quotes for "${dealName}" — falling back to last of ${quotes.length}`);
    return refs[refs.length - 1].id;
  }

  versioned.sort((a, b) => b.version - a.version);
  const winner = versioned[0];
  console.log(`[hubspot] Selected quote v${winner.version} (id: ${winner.id}) for "${dealName}"`);
  return winner.id;
}

export async function getQuoteLineItems(quoteId: string): Promise<HubSpotLineItem[]> {
  const assocData = await hubspotFetch(
    `/crm/v3/objects/quotes/${quoteId}/associations/line_items`
  ) as { results?: Array<{ id: string }> };

  const lineItemIds = assocData.results?.map((r) => r.id) ?? [];
  if (lineItemIds.length === 0) return [];

  const props = "name,hs_sku,price,quantity,amount,hs_line_item_currency_code";
  const items = await Promise.all(
    lineItemIds.map((id) =>
      hubspotFetch(`/crm/v3/objects/line_items/${id}?properties=${props}`) as Promise<{
        properties?: {
          name?: string;
          hs_sku?: string;
          amount?: string;
        };
      }>
    )
  );

  return items.map((item) => ({
    name: item.properties?.name ?? "",
    sku: item.properties?.hs_sku ?? "",
    amount: parseFloat(item.properties?.amount ?? "0") || 0,
  }));
}
