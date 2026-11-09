import {requireQuoteProductAccess} from '@/lib/ada-server';
import {parsePlanningScenario,UUID} from '@/lib/capacity-scenarios';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function access(){
 if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://gkvaeqlqrthztobxitvn.supabase.co')return {ok:false as const,response:json({error:'Tracker Lab only.'},403)};
 return requireQuoteProductAccess();
}
export async function GET(){
 const a=await access();if(!a.ok)return a.response;
 const r=await a.actorSupabase.from('lab_capacity_scenarios').select('id,version,updated_at,document').eq('owner_id',a.actorId).order('updated_at',{ascending:false});
 if(r.error)return json({error:'Saved scenarios could not load. Your current preview is unchanged.'},503);
 return json({scenarios:r.data});
}
export async function POST(request:Request){
 const a=await access();if(!a.ok)return a.response;
 let body,document;
 try{const raw=await request.text();if(raw.length>200000)throw new Error('Scenario is too large.');body=JSON.parse(raw);document=parsePlanningScenario(body.document);if(!UUID.test(body.id??'')||!Number.isSafeInteger(body.version)||body.version<0)throw new Error('Invalid scenario version.');}catch(e){return json({error:e instanceof Error?e.message:'Invalid scenario.'},400);}
 const table=a.actorSupabase.from('lab_capacity_scenarios');
 const r=body.version===0?await table.insert({id:body.id,owner_id:a.actorId,document}).select('id,version,updated_at,document').single():await table.update({document,version:body.version+1,updated_at:new Date().toISOString()}).eq('id',body.id).eq('owner_id',a.actorId).eq('version',body.version).select('id,version,updated_at,document').maybeSingle();
 if(r.error||!r.data)return json({error:r.error&&r.error.code!=='23505'?'Scenario could not save. Your preview is still here.':'This scenario changed on another device. Reload the saved list and reopen it, or Save as New.'},r.error&&r.error.code!=='23505'?503:409);
 return json({scenario:r.data});
}
