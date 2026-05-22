export interface ProjectLookupResult {
  job_number: string;
  hubspot_deal_id: string | null;
  hubspot_deal_url: string | null;
  hubspot_deal_name: string | null;
  qbo_project_id: string | null;
  qbo_project_url: string | null;
  qbo_project_name: string | null;
}

export function getLookupLinkedFields(result: ProjectLookupResult) {
  return {
    hubspotDealId: result.hubspot_deal_id,
    hubspotDealUrl: result.hubspot_deal_url,
    qboProjectId: result.qbo_project_id,
    qboProjectUrl: result.qbo_project_url,
  };
}

export async function fetchProjectLookup(jobNumber: string) {
  const response = await fetch(
    `/api/projects/lookup?job_number=${encodeURIComponent(jobNumber)}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "Lookup failed");
  }

  return (await response.json()) as ProjectLookupResult;
}
