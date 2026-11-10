import { requireQuoteProductAccess } from '@/lib/ada-server';
import { labManagementGuard, managementJson as json } from '@/lib/quote-management-server';
import { readHubSpotProjectIdentity } from '@/lib/hubspot-project-identity';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = labManagementGuard();
  if (blocked) return blocked;
  const access = await requireQuoteProductAccess();
  if (!access.ok) return access.response;
  if (access.actorRole !== 'admin') return json({ error: 'A Lab administrator must refresh HubSpot project details.' }, 403);
  const { id } = await context.params;
  const source = await access.actorSupabase.from('lab_project_quote_sources').select('workspace_id').eq('project_id', id).maybeSingle();
  if (source.error) return json({ error: 'Project access could not be verified.' }, 503);
  if (!source.data) return json({ error: 'Linked project not found.' }, 404);
  const project = await access.actorSupabase.from('projects').select('hubspot_deal_id').eq('id', id).maybeSingle();
  if (project.error) return json({ error: 'Project details could not load.' }, 503);
  if (!project.data?.hubspot_deal_id) return json({ error: 'Confirm the project’s HubSpot deal link before refreshing.' }, 409);
  const token = process.env.LAB_HUBSPOT_READ_TOKEN;
  if (!token) return json({ error: 'Manual refresh needs the Lab’s server-only LAB_HUBSPOT_READ_TOKEN. Configure a HubSpot credential with deal read access in the Lab Vercel project.' }, 503);
  let identity;
  try { identity = await readHubSpotProjectIdentity(project.data.hubspot_deal_id, token); }
  catch { return json({ error: 'HubSpot identity could not be verified. No project details were changed.' }, 502); }
  const saved = await access.supabase.rpc('apply_lab_hubspot_identity', {
    p_project_id: id, p_deal_id: identity.dealId, p_name: identity.name, p_job_number: identity.jobNumber,
  });
  if (saved.error) return json({ error: 'The refresh could not be applied. Check for a conflicting job number or changed deal link, then reload.' }, 409);
  return json({ identity: saved.data });
}
