import { execSync } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";
import type { ProjectLookupResult } from "@/lib/project-lookups";
import { getQboAccessToken } from "@/lib/qbo-auth";
import { buildQboProjectDetailsUrl } from "@/lib/qbo-project-profitability";

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

interface QboProjectSearchResponse {
  data?: {
    projectManagementProjects?: {
      edges?: Array<{
        node?: {
          id?: string;
          name?: string;
          status?: string;
        };
      }>;
      pageInfo?: {
        hasNextPage?: boolean;
        endCursor?: string | null;
      };
    };
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
    const token = process.env.HUBSPOT_API_KEY;
    if (!token) throw new Error("HUBSPOT_API_KEY not set in environment");

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
    const accessToken = await getQboAccessToken();
    const query = 'query projectManagementProjects($first: PositiveInt!, $after: String, $filter: ProjectManagement_ProjectFilter!, $orderBy: [ProjectManagement_OrderBy!]) { projectManagementProjects(first: $first, after: $after, filter: $filter, orderBy: $orderBy) { edges { node { id name status } } pageInfo { hasNextPage endCursor } } }';
    let cursor: string | null = null;

    do {
      const variables: { first: number; filter: Record<string, never>; orderBy: string[]; after?: string } = {
        first: 100,
        filter: {},
        orderBy: ['DUE_DATE_DESC'],
      };
      if (cursor) variables.after = cursor;

      const qboResponse = await fetch(
        'https://qb.api.intuit.com/graphql',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ query, variables }),
          cache: 'no-store',
        }
      );

      if (!qboResponse.ok) {
        throw new Error(`QBO lookup failed: ${qboResponse.status}`);
      }

      const data = (await qboResponse.json()) as QboProjectSearchResponse;
      const result = data.data?.projectManagementProjects;
      const match = (result?.edges ?? []).find((edge) => edge.node?.name?.startsWith(String(jobNumber)));

      if (match?.node?.id) {
        return {
          qbo_project_id: match.node.id,
          qbo_project_url: buildQboProjectDetailsUrl(match.node.id),
          qbo_project_name: match.node.name ?? null,
        };
      }

      cursor = result?.pageInfo?.hasNextPage ? result.pageInfo.endCursor ?? null : null;
    } while (cursor);

    return {
      qbo_project_id: null,
      qbo_project_url: null,
      qbo_project_name: null,
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
