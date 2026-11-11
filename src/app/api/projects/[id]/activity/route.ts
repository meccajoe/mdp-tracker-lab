import { requireQuoteProductAccess } from '@/lib/ada-server';
import { labManagementGuard, managementJson as json } from '@/lib/quote-management-server';
import { validateActivityCapture, summarizeProjectActivity } from '@/lib/lab-project-activity';

export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
 const blocked=labManagementGuard();if(blocked)return blocked;
 const access=await requireQuoteProductAccess();if(!access.ok)return access.response;
 const {id}=await context.params;
 const source=await access.actorSupabase.from('lab_project_quote_sources').select('workspace_id').eq('project_id',id).maybeSingle();
 if(source.error)return json({error:'Project access could not be verified.'},503);
 if(!source.data)return json({error:'Quote-backed Lab project not found.'},404);
 const result=await access.actorSupabase.from('lab_project_activity_snapshots')
  .select('captured_at,imported_at,source_sha256,job_number,hubspot_deal_id,snapshot')
  .eq('project_id',id).order('captured_at',{ascending:false}).limit(1).maybeSingle();
 if(result.error)return json({error:'Project activity could not load.'},503);
 if(!result.data)return json({activity:null});
 const project=await access.actorSupabase.from('projects').select('job_number,hubspot_deal_id').eq('id',id).maybeSingle();
 if(project.error||!project.data)return json({error:'Project identity could not be verified.'},503);
 const row=result.data;
 if(project.data.job_number!==row.job_number||project.data.hubspot_deal_id!==row.hubspot_deal_id)return json({error:'Activity belongs to a previous project link. Reconcile before using it.'},409);
 try{
  validateActivityCapture(row.snapshot);
  if(row.snapshot.project.job_number!==row.job_number||row.snapshot.project.hubspot_deal_id!==row.hubspot_deal_id)throw Error('Identity mismatch');
  return json({activity:row,summary:summarizeProjectActivity(row.snapshot)});
 }catch{return json({error:'Project activity needs reconciliation before it can be displayed.'},503);}
}
