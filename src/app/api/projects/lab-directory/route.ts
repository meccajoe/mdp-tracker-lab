import {requireQuoteProductAccess} from '@/lib/ada-server';
import {labManagementGuard,managementJson as json} from '@/lib/quote-management-server';
import {directoryProject} from '@/lib/lab-project-directory';
export async function GET(){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const access=await requireQuoteProductAccess();if(!access.ok)return access.response;
 try{
  const sources:any[]=[];
  for(let from=0;;from+=200){
   const page=await access.actorSupabase.from('lab_project_quote_sources').select('project_id,workbook_revision,snapshot,projects!inner(id,name,client,job_number,pm,status,close_date,due_date,hubspot_deal_id,hubspot_deal_url)').order('project_id').range(from,from+199);
   if(page.error)throw Error('source');sources.push(...(page.data??[]));if((page.data??[]).length<200)break;
  }
  const latest=new Map(),budgets=new Map();
  for(let offset=0;offset<sources.length;offset+=200){
   const ids=sources.slice(offset,offset+200).map(s=>s.project_id);
   const current=await access.actorSupabase.from('lab_current_project_budget_totals')
    .select('project_id,workbook_revision,totals').in('project_id',ids);
   if(current.error)throw Error('budgets');
   for(const budget of current.data??[])budgets.set(budget.project_id,budget);
   for(let from=0;;from+=200){
    const page=await access.actorSupabase.from('lab_project_activity_snapshots').select('id,source_sha256,project_id,captured_at,job_number,hubspot_deal_id,snapshot').in('project_id',ids).order('captured_at',{ascending:false}).order('id').range(from,from+199);
    if(page.error)throw Error('activity');for(const row of page.data??[])if(!latest.has(row.project_id))latest.set(row.project_id,row);
    if((page.data??[]).length<200)break;
   }
  }
  const costing=new Map(),snapshotIds=[...latest.values()].map(row=>row.id);
  for(let offset=0;offset<snapshotIds.length;offset+=200){
   const ids=snapshotIds.slice(offset,offset+200);
   for(let from=0;;from+=200){
    const page=await access.actorSupabase.from('lab_project_costing_snapshots').select('activity_snapshot_id,evidence').in('activity_snapshot_id',ids).order('resolved_at',{ascending:false}).order('id').range(from,from+199);
    if(page.error)throw Error('costing');for(const row of page.data??[])if(!costing.has(row.activity_snapshot_id))costing.set(row.activity_snapshot_id,row);
    if((page.data??[]).length<200)break;
   }
  }
  return json({projects:sources.map(source=>{const activity=latest.get(source.project_id);const budget=budgets.get(source.project_id);
   const current=budget?{...source,workbook_revision:budget.workbook_revision,snapshot:{...source.snapshot,totals:budget.totals}}:source;
   return directoryProject(current,activity,activity?costing.get(activity.id):null);})});
 }catch{return json({error:'Projects could not be loaded. Try again.'},503);}
}
