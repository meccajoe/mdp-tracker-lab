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

export async function getDealQuote(dealId: string): Promise<string | null> {
  const assocData = await hubspotFetch(
    `/crm/v3/objects/deals/${dealId}/associations/quotes`
  ) as { results?: Array<{ id: string }> };

  return assocData.results?.[0]?.id ?? null;
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
