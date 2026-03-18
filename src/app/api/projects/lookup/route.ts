import { execSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import type { ProjectLookupResult } from "@/lib/project-lookups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HubSpotSearchResponse {
  results?: Array<{
    id: string;
    properties?: {
      dealname?: string;
      job_number?: string;
    };
  }>;
}

interface QboTokenResponse {
  access_token?: string;
}

interface QboQueryResponse {
  QueryResponse?: {
    Customer?: Array<{
      Id?: string;
      DisplayName?: string;
    }>;
  };
}

function runSecretCommand(command: string): string {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: "/bin/zsh",
  }).trim();
}

function getOnePasswordValue(item: string, field: string) {
  const escapedItem = item.replaceAll("\"", "\\\"");
  const escapedField = field.replaceAll("\"", "\\\"");
  return runSecretCommand(
    `source ~/.config/archie/credentials/1password.env && op item get "${escapedItem}" --vault Archie --fields "${escapedField}"`
  );
}

async function lookupHubSpot(jobNumber: string) {
  try {
    const token = getOnePasswordValue(
      "HubSpot - Mecca QBO Integration",
      "credential"
    );

    const response = await fetch(
      "https://api.hubapi.com/crm/v3/objects/deals/search",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "job_number",
                  operator: "EQ",
                  value: jobNumber,
                },
              ],
            },
          ],
          properties: ["dealname", "job_number"],
          limit: 1,
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(`HubSpot lookup failed: ${response.status}`);
    }

    const data = (await response.json()) as HubSpotSearchResponse;
    const deal = data.results?.[0];

    if (!deal?.id) {
      return {
        hubspot_deal_id: null,
        hubspot_deal_url: null,
        hubspot_deal_name: null,
      };
    }

    return {
      hubspot_deal_id: deal.id,
      hubspot_deal_url: `https://app-na2.hubspot.com/contacts/23392178/deal/${deal.id}`,
      hubspot_deal_name: deal.properties?.dealname ?? null,
    };
  } catch (error) {
    console.error("HubSpot lookup error", error);
    return {
      hubspot_deal_id: null,
      hubspot_deal_url: null,
      hubspot_deal_name: null,
    };
  }
}

async function lookupQbo(jobNumber: string) {
  try {
    const [clientId, clientSecret, refreshToken, realmId] = [
      getOnePasswordValue("QBO - Mecca HubSpot Integration", "client ID"),
      getOnePasswordValue("QBO - Mecca HubSpot Integration", "client secret"),
      getOnePasswordValue("QBO - Mecca HubSpot Integration", "refresh_token"),
      getOnePasswordValue("QBO - Mecca HubSpot Integration", "realm_id"),
    ];

    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64"
    );

    const tokenResponse = await fetch(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
        cache: "no-store",
      }
    );

    if (!tokenResponse.ok) {
      throw new Error(`QBO token refresh failed: ${tokenResponse.status}`);
    }

    const tokenData = (await tokenResponse.json()) as QboTokenResponse;
    if (!tokenData.access_token) {
      throw new Error("QBO token refresh returned no access token");
    }

    const query = `SELECT Id, DisplayName FROM Customer WHERE Job = true AND DisplayName LIKE '${jobNumber}%'`;
    const qboResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (!qboResponse.ok) {
      throw new Error(`QBO lookup failed: ${qboResponse.status}`);
    }

    const data = (await qboResponse.json()) as QboQueryResponse;
    const customer = data.QueryResponse?.Customer?.[0];

    if (!customer?.Id) {
      return {
        qbo_project_id: null,
        qbo_project_url: null,
        qbo_project_name: null,
      };
    }

    return {
      qbo_project_id: customer.Id,
      qbo_project_url: `https://app.qbo.intuit.com/app/projectdetail?projectId=${customer.Id}`,
      qbo_project_name: customer.DisplayName ?? null,
    };
  } catch (error) {
    console.error("QBO lookup error", error);
    return {
      qbo_project_id: null,
      qbo_project_url: null,
      qbo_project_name: null,
    };
  }
}

export async function GET(request: NextRequest) {
  const jobNumber = request.nextUrl.searchParams.get("job_number")?.trim();

  if (!jobNumber) {
    return NextResponse.json(
      { error: "job_number is required" },
      { status: 400 }
    );
  }

  const [hubspot, qbo] = await Promise.all([
    lookupHubSpot(jobNumber),
    lookupQbo(jobNumber),
  ]);

  const result: ProjectLookupResult = {
    job_number: jobNumber,
    ...hubspot,
    ...qbo,
  };

  return NextResponse.json(result);
}
