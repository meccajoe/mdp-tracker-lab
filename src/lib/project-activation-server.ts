import type {SupabaseClient} from '@supabase/supabase-js';
import {activationDates,type ActivationRevision} from './project-activation';
/** Read minimal status history under the caller's RLS; never rewrite quote snapshots. */
export async function loadActivationDates(db:SupabaseClient,workspaceId?:string,maxRevision?:number){
 const dates:Record<string,string>=Object.create(null);
 for(let offset=0;;offset+=1000){
  let query=db.from('quote_workbook_revisions').select('workspace_id,created_at,forecast_status:document->schedule->>status,project_status:document->schedule->>projectStatus,planning_status:document->planning->>status').order('workspace_id').order('revision').range(offset,offset+999);
  if(workspaceId)query=query.eq('workspace_id',workspaceId);
  if(maxRevision!==undefined)query=query.lte('revision',maxRevision);
  const r=await query;
  if(r.error)throw Error('Project activation history unavailable. Refresh before scheduling.');
  for(const [id,date] of Object.entries(activationDates((r.data??[]) as ActivationRevision[])))if(!dates[id]||date<dates[id])dates[id]=date;
  if((r.data?.length??0)<1000)return dates;
 }
}
