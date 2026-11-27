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
  const history = await access.actorSupabase.from('lab_project_budget_revisions')
    .select('id,workspace_id,workbook_revision,applied_at,totals:budget->totals').eq('project_id',id).order('id',{ascending:false}).limit(20);
  if (history.error) return json({error:'Project budget history could not load.'},503);
  const latest = history.data?.[0];
  let currentBudget = null;
  if (latest) {
    const current = await access.actorSupabase.from('lab_project_budget_revisions')
      .select('budget').eq('project_id',id).eq('id',latest.id).maybeSingle();
    if (current.error || !current.data) return json({error:'Current project budget could not load.'},503);
    currentBudget = {...latest,snapshot:current.data.budget};
  }
  return json({ currentBudget, budgetHistory:history.data??[], project: project.data, source: source.data, liveProjectStatus: project.data.status === 'Completed' ? 'Complete' : project.data.status === 'Active' ? 'Active' : 'Not Active' });
}
