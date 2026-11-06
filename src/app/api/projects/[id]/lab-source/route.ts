import { requireQuoteProductAccess } from '@/lib/ada-server';
import { labManagementGuard, managementJson as json } from '@/lib/quote-management-server';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = labManagementGuard();
  if (blocked) return blocked;
  const access = await requireQuoteProductAccess();
  if (!access.ok) return access.response;
  const { id } = await context.params;
  const source = await access.actorSupabase.from('lab_project_quote_sources')
    .select('workspace_id,workbook_revision,imported_at,snapshot').eq('project_id', id).maybeSingle();
  if (source.error) return json({ error: 'Project quote baseline could not load.' }, 503);
  if (!source.data) return json({ error: 'Quote-backed Lab project not found.' }, 404);
  const project = await access.actorSupabase.from('projects').select('*').eq('id', id).maybeSingle();
  if (project.error || !project.data) return json({ error: 'Project details could not load.' }, 503);
  return json({ project: project.data, source: source.data });
}
