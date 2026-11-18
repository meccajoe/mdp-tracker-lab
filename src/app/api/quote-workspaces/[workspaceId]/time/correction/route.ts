import {requireQuoteProductWorkspaceAccess} from '@/lib/ada-server';
import {labManagementGuard,managementJson as json} from '@/lib/quote-management-server';
export const dynamic='force-dynamic';
async function handle(request:Request,context:{params:Promise<{workspaceId:string}>}){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const {workspaceId}=await context.params;
 const access=await requireQuoteProductWorkspaceAccess(workspaceId);if(!access.ok)return access.response;
 let args:{p_workspace_id:string;p_total_ms?:number;p_version?:number;p_reason?:string}={p_workspace_id:workspaceId};
 if(request.method==='POST'){
  if(request.headers.get('X-Quote-Time-Actor')!==access.actorId)return json({error:'Account changed. Reload this quote.'},409);
  try{const text=await request.text();if(text.length>2000)throw Error();const body=JSON.parse(text);
   if(!Number.isSafeInteger(body.totalMs)||body.totalMs<0||body.totalMs>360000000000||!Number.isInteger(body.version)||body.version<0||typeof body.reason!=='string'||!body.reason.trim()||body.reason.trim().length>500)throw Error();
   args={...args,p_total_ms:body.totalMs,p_version:body.version,p_reason:body.reason.trim()};
  }catch{return json({error:'Enter valid hours, minutes and a reason.'},400);}
 }
 const result=await access.actorSupabase.rpc('lab_quote_time_correct',args);
 if(result.error)return json({error:result.error.code==='PT409'?'Time was corrected elsewhere. Close and reopen Edit Time before saving.':result.error.code==='42501'?'You cannot edit this quote’s time.':'Time correction is unavailable. No recorded time was changed.'},result.error.code==='PT409'?409:result.error.code==='42501'?403:503);
 return json({...result.data,actorId:access.actorId});
}
export const GET=handle;export const POST=handle;
