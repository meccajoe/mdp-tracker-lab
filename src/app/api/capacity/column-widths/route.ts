import {NextResponse} from 'next/server';
import {requireQuoteProductAccess} from '@/lib/ada-server';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const keys:Record<string,string>={'capacity-projects':'lab_capacity_projects_widths_v1','capacity-roster':'lab_capacity_roster_widths_v1','quotes-list':'lab_quotes_list_widths_v1'};
async function access(){
 if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://gkvaeqlqrthztobxitvn.supabase.co')return {ok:false as const,response:json({error:'Available only in Tracker Lab.'},403)};
 return requireQuoteProductAccess();
}
function validWidths(value:unknown):value is Record<string,number>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const entries=Object.entries(value);
 return entries.length<=100&&entries.every(([name,width])=>name.length>0&&name.length<=120&&typeof width==='number'&&Number.isFinite(width)&&width>=40&&width<=10000);
}
export async function GET(request:Request){
 const actor=await access();if(!actor.ok)return actor.response;
 const table=new URL(request.url).searchParams.get('table')??'';
 const key=Object.hasOwn(keys,table)?keys[table]:null;
 if(!key)return json({error:'Unknown table.'},400);
 const result=await actor.supabase.auth.admin.getUserById(actor.actorId);
 if(result.error||!result.data.user)return json({error:'Could not load your column widths.'},503);
 const widths=result.data.user.user_metadata[key];
 return json({userId:actor.actorId,widths:validWidths(widths)?widths:null});
}
export async function PUT(request:Request){
 const actor=await access();if(!actor.ok)return actor.response;
 let body;
 try{const raw=await request.text();if(raw.length>20000)throw new Error();body=JSON.parse(raw);}catch{return json({error:'Invalid column widths.'},400);}
 const key=typeof body?.table==='string'&&Object.hasOwn(keys,body.table)?keys[body.table]:null;
 if(!key||!validWidths(body?.widths))return json({error:'Invalid column widths.'},400);
 // Auth merges this single metadata key; never accept a caller-supplied user ID or other account fields.
 const result=await actor.supabase.auth.admin.updateUserById(actor.actorId,{user_metadata:{[key]:body.widths}});
 if(result.error)return json({error:'Could not save column widths to your account.'},503);
 return json({saved:true});
}
