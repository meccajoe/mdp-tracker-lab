import { execSync } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";
import type { ProjectLookupResult } from "@/lib/project-lookups";
import { getQboAccessToken } from "@/lib/qbo-auth";

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
    `source ~/.config/archie/credentials/1password.env && op item get "${escapedItem}" --vault Archie --fields "${escapedField}" --reveal`
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

const QBO_REALM_ID = "9130350693918016";

async function lookupQbo(jobNumber: string) {
  try {
    const accessToken = await getQboAccessToken();

    const query = `SELECT Id, DisplayName FROM Customer WHERE Job = true AND DisplayName LIKE '${jobNumber}%'`;
    const qboResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}/query?query=${encodeURIComponent(query)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
      qbo_project_url: `https://app.qbo.intuit.com/app/customerdetail?nameId=${customer.Id}`,
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
