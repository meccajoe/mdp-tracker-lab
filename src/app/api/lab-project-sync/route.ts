import {requireQuoteProductAccess} from '@/lib/ada-server';
import {labManagementGuard,managementJson as json} from '@/lib/quote-management-server';
import {executeSync,syncConfigured} from './server';
export const maxDuration=300;
export async function GET(){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const access=await requireQuoteProductAccess();if(!access.ok)return access.response;
 if(access.actorRole!=='admin')return json({error:'Lab administrator access required.'},403);
 const runs=await access.supabase.from('lab_project_sync_runs').select('id,mode,status,started_at,finished_at,error_code').order('started_at',{ascending:false}).limit(10);
 if(runs.error)return json({error:'Sync history could not load.'},503);
 const ids=(runs.data??[]).map(r=>r.id);
 const outcomes=ids.length?await access.supabase.from('lab_project_sync_results').select('run_id,scope_id,project_id,outcome,code,missing_hours,details,created_at,projects(name,job_number)').eq('run_id',ids[0]).order('created_at',{ascending:false}).limit(1001):{data:[],error:null};
 if(outcomes.error||(outcomes.data?.length??0)>1000)return json({error:'Sync outcomes could not load.'},503);
 return json({configured:syncConfigured(),enabled:process.env.LAB_DAILY_SYNC_ENABLED==='true',schedule:'Daily at 6:00 a.m. America/Chicago',runs:runs.data,results:outcomes.data});
}
export async function POST(request:Request){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const access=await requireQuoteProductAccess();if(!access.ok)return access.response;
 if(access.actorRole!=='admin')return json({error:'Lab administrator access required.'},403);
 if(!syncConfigured())return json({error:'Configure the scoped Production Database Read token in Lab before running sync.'},503);
 let body;try{body=await request.json();}catch{return json({error:'Choose preview or apply.'},400);}
 if(!['preview','apply'].includes(body?.action))return json({error:'Choose preview or apply.'},400);
 try{return json(await executeSync(body.action==='apply'?'manual':'preview'));}catch{return json({error:'Sync could not complete. Check the run log.'},503);}
}
