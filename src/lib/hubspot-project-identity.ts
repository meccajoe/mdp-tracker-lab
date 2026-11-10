export type HubSpotProjectIdentity = { dealId: string; name: string; jobNumber: string | null };

/** One-way identity read only. Never reads amounts or writes to HubSpot. */
export async function readHubSpotProjectIdentity(dealId: string, token: string, fetcher: typeof fetch = fetch): Promise<HubSpotProjectIdentity> {
  if (!/^\d+$/.test(dealId)) throw Error('The project has an invalid HubSpot deal link.');
  const response = await fetcher(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=dealname,job_number`, {
    method: 'GET', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('HubSpot could not be read. Check the Lab read-only connection and try again.');
  const body = await response.json();
  const name = body.properties?.dealname, job = body.properties?.job_number;
  if (body.id !== dealId || typeof name !== 'string' || !name.trim() || name.length > 300 ||
      (job != null && (typeof job !== 'string' || job.length > 60))) throw Error('HubSpot returned an invalid project identity.');
  // Keep the exact deal name, including punctuation and whitespace.
  return { dealId, name, jobNumber: job || null };
}
