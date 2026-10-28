import type {SupabaseClient} from '@supabase/supabase-js';
import {activationDates,type ActivationRevision} from './project-activation';
const PAGE_SIZE=200;
type HistoryRow=ActivationRevision&{revision:number};
type ReadError={code?:string;status?:number};
function temporary(error:ReadError){
 return error.status===0||error.status===429||(error.status??0)>=500||['57014','53300','57P01','08000','08003','08006','PGRST000','PGRST001','PGRST002','PGRST003'].includes(error.code??'');
}
/** Read minimal status history under the caller's RLS; never rewrite quote snapshots. */
export async function loadActivationDates(db:SupabaseClient,workspaceId?:string,maxRevision?:number){
 const dates:Record<string,string>=Object.create(null);
 let cursor:HistoryRow|undefined;
 for(;;){
  let rows:HistoryRow[]=[];
  for(let attempt=0;;attempt++){
   // Seek on the primary key instead of repeatedly scanning/discarding earlier
   // revisions. Small pages also bound JSON decompression work per DB request.
   let query=db.from('quote_workbook_revisions').select('workspace_id,revision,created_at,forecast_status:document->schedule->>status,project_status:document->schedule->>projectStatus,planning_status:document->planning->>status').order('workspace_id').order('revision').limit(PAGE_SIZE);
   if(workspaceId)query=query.eq('workspace_id',workspaceId);
   if(maxRevision!==undefined)query=query.lte('revision',maxRevision);
   if(cursor)query=query.or(`workspace_id.gt.${cursor.workspace_id},and(workspace_id.eq.${cursor.workspace_id},revision.gt.${cursor.revision})`);
   const r=await query;
   if(!r.error){rows=(r.data??[]) as HistoryRow[];break;}
   const retry=attempt<2&&temporary({code:r.error.code,status:r.status});
   // Do not log documents, names, credentials or raw PostgREST error details.
   console.warn('capacity.activation-history', {code:r.error.code||'transport',status:r.status,attempt:attempt+1,retry});
   if(!retry)throw Error('Project activation history could not load. Retry loading schedules; saved quotes are unchanged.');
   await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)));
  }
  for(const [id,date] of Object.entries(activationDates(rows)))if(!dates[id]||date<dates[id])dates[id]=date;
  if(rows.length<PAGE_SIZE)return dates;
  cursor=rows[rows.length-1];
 }
}
