import {NextResponse} from 'next/server';
import {requireQuoteProductAccess} from '@/lib/ada-server';
import {emptyCapacity,parseCapacity} from '@/lib/capacity';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function access(){
 if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://gkvaeqlqrthztobxitvn.supabase.co')return {ok:false as const,response:json({error:'Capacity is available only in Tracker Lab.'},403)};
 return requireQuoteProductAccess();
}
export async function GET(){
 const actor=await access();if(!actor.ok)return actor.response;
 const result=await actor.actorSupabase.from('lab_capacity_settings_revisions').select('revision,document').order('revision',{ascending:false}).limit(1).maybeSingle();
 if(result.error)return json({error:['42P01','PGRST205'].includes(result.error.code)?'Shared capacity settings need the lab database migration. Quote demand can still be viewed; roster changes cannot be saved yet.':'Shared capacity settings could not load. Quote demand can still be viewed; roster changes are disabled until settings reload.',document:emptyCapacity(),version:0,canEdit:false},503);
 const capability=await actor.actorSupabase.from('quote_user_capabilities').select('capability').eq('capability','create_workspace').is('revoked_at',null).limit(1);
 try{return json({document:result.data?parseCapacity(result.data.document):emptyCapacity(),version:result.data?.revision??0,canEdit:!capability.error&&Boolean(capability.data?.length)});}catch{return json({error:'Saved capacity settings are invalid. Their history has been preserved.'},422);}
}
export async function POST(request:Request){
 const actor=await access();if(!actor.ok)return actor.response;
 let document,version;
 try{const raw=await request.text();if(new TextEncoder().encode(raw).length>450000)throw new Error('Capacity settings are too large.');const body=JSON.parse(raw);version=body.expectedVersion;if(!Number.isSafeInteger(version)||version<0||version>=2147483647)throw new Error('Invalid revision.');document=parseCapacity(body.document);}catch(error){return json({error:error instanceof Error?error.message:'Invalid settings.'},400);}
 const result=await actor.actorSupabase.from('lab_capacity_settings_revisions').insert({revision:version+1,document,created_by:actor.actorId,created_by_email:actor.actorEmail}).select('revision').single();
 if(result.error)return json({error:['PT409','23505'].includes(result.error.code)?'Capacity settings changed on another device. Reload before saving. Your draft is still here.':'Capacity settings could not save. Your draft is still here.'},['PT409','23505'].includes(result.error.code)?409:403);
 return json({version:result.data.revision},201);
}
