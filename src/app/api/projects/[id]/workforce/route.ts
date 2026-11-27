import {requireQuoteProductAccess} from '@/lib/ada-server';
import {labManagementGuard,managementJson as json} from '@/lib/quote-management-server';

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const access=await requireQuoteProductAccess();if(!access.ok)return access.response;
 const {id}=await params;
 const db=access.actorSupabase;
 const evidence=await db.from('lab_workforce_handoff_evidence')
  .select('workspace_id,workbook_revision,job_number,deal_id,links,entries').eq('project_id',id).maybeSingle();
 if(evidence.error)return json({error:'Workforce evidence could not load.'},503);
 if(!evidence.data)return json({evidence:null});
 const project=await db.from('projects').select('job_number,hubspot_deal_id').eq('id',id).maybeSingle();
 if(project.error||!project.data)return json({error:'Project identity could not be verified.'},503);
 if(project.data.job_number!==evidence.data.job_number||project.data.hubspot_deal_id!==evidence.data.deal_id){
  return json({error:'Workforce evidence belongs to a previous project link.'},409);
 }
 return json({evidence:evidence.data});
}
