import {requireQuoteProductAccess} from '@/lib/ada-server';
import {teamSources} from '@/lib/team-schedule-server';
import {buildTeamSchedule} from '@/lib/team-schedule-source';
import {parseTeamOptions,sameTeamSources} from '@/lib/team-schedule';
export const dynamic='force-dynamic';
export const maxDuration=60;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function access(){
 if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://gkvaeqlqrthztobxitvn.supabase.co')return {ok:false as const,response:json({error:'Lab only.'},403)};
 return requireQuoteProductAccess();
}
export async function GET(request:Request){
 const a=await access();if(!a.ok)return a.response;
 const db=a.actorSupabase;
 const url=new URL(request.url);
 if(url?.searchParams.get('view')==='live'){
  try{
   const latest=await db.from('lab_team_schedule_revisions').select('document').order('revision',{ascending:false}).limit(1).maybeSingle();
   if(latest.error)throw Error('Saved staffing availability could not load. Try refreshing.');
   const start=url.searchParams.get('start'),finish=url.searchParams.get('finish');
   const saved=latest.data?.document.result.options;
   const options=parseTeamOptions({start,finish,priority:saved?.priority??[],availability:(saved?.availability??[]).filter((a:{date:string})=>a.date>=String(start)&&a.date<=String(finish))});
   const current=await teamSources(db);
   return json({result:buildTeamSchedule(current.quotes,current.roster,options,true)});
  }catch(e){return json({error:e instanceof Error?e.message:'Schedule unavailable.'},400);}
 }
 const [latest,approved]=await Promise.all([db.from('lab_team_schedule_revisions').select('revision,document,created_at').order('revision',{ascending:false}).limit(1).maybeSingle(),db.from('lab_team_schedule_revisions').select('revision,document,created_at').eq('status','approved').order('revision',{ascending:false}).limit(1).maybeSingle()]);
 if(latest.error||approved.error)return json({error:'Team schedule storage is unavailable. Apply the lab team-schedule migration first.'},503);
 try{const current=await teamSources(db);return json({latest:latest.data,approved:approved.data,stale:latest.data?!sameTeamSources(latest.data.document.sources,current.sources):false,approvedStale:approved.data?!sameTeamSources(approved.data.document.sources,current.sources):false});}catch(e){return json({error:e instanceof Error?e.message:'Sources unavailable.'},503);}
}
export async function POST(request:Request){
 const a=await access();if(!a.ok)return a.response;
 try{
  const raw=await request.text();if(raw.length>300000)throw Error('Request too large.');
  const body=JSON.parse(raw);if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0)throw Error('Invalid revision.');
  const db=a.actorSupabase,latest=await db.from('lab_team_schedule_revisions').select('revision,document,status').order('revision',{ascending:false}).limit(1).maybeSingle();
  if(latest.error)throw Error('Team schedule storage unavailable.');
  if((latest.data?.revision??0)!==body.expectedVersion)return json({error:'Team schedule changed. Reload before saving.'},409);
  const current=await teamSources(db);
  let document,status:'proposed'|'approved';
  if(body.action==='generate'||body.action==='preview'){
   const options=parseTeamOptions(body.options),result=buildTeamSchedule(current.quotes,current.roster,options);
   if(body.action==='preview')return json({result});
   document={engine:'team-daily-1',sources:current.sources,result};status='proposed';
  }else if(body.action==='approve'){
   if(!latest.data||latest.data.status!=='proposed')throw Error('Generate a proposal first.');
   if(!sameTeamSources(latest.data.document.sources,current.sources))return json({error:'Quotes, schedules or roster changed. Generate a fresh proposal before approval.'},409);
   document=latest.data.document;status='approved';
  }else throw Error('Unknown action.');
  const saved=await db.from('lab_team_schedule_revisions').insert({revision:body.expectedVersion+1,status,document,created_by:a.actorId,created_by_email:a.actorEmail}).select('revision').single();
  if(saved.error)return json({error:['PT409','23505'].includes(saved.error.code)?'Sources or team schedule changed. Reload and regenerate.':'Team schedule could not save. Check permissions; the previous approved schedule remains intact.'},409);
  return json({version:saved.data.revision},201);
 }catch(e){return json({error:e instanceof Error?e.message:'Schedule could not save.'},400);}
}
