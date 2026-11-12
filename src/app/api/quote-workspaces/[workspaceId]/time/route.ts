import {requireQuoteProductWorkspaceAccess} from '@/lib/ada-server';
import {labManagementGuard,managementJson as json} from '@/lib/quote-management-server';
import {parseQuoteTimeSpans} from '@/lib/quote-time';
export const dynamic='force-dynamic';
async function handle(request:Request,context:{params:Promise<{workspaceId:string}>}){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const {workspaceId}=await context.params;
 if(!/^[0-9a-f-]{36}$/i.test(workspaceId))return json({error:'Invalid quote ID.'},400);
 const access=await requireQuoteProductWorkspaceAccess(workspaceId);if(!access.ok)return access.response;
 if(request.method==='POST'&&request.headers.get('X-Quote-Time-Actor')!==access.actorId)return json({error:'Account changed. Reload this quote.'},409);
 let spans;
 try{const text=request.method==='POST'?await request.text():'[]';if(text.length>30000)throw Error('Time log too large.');spans=parseQuoteTimeSpans(JSON.parse(text));}catch{return json({error:'Invalid time log.'},400);}
 const [time,control]=await Promise.all([
  access.actorSupabase.rpc('lab_quote_time',{p_workspace_id:workspaceId,p_spans:spans}),
  access.actorSupabase.from('lab_quote_controls').select('quote_status').eq('workspace_id',workspaceId).maybeSingle(),
 ]);
 if(time.error||control.error)return json({error:'Quote timer could not sync. Recorded quote data is unchanged.'},503);
 const editAccess=await requireQuoteProductWorkspaceAccess(workspaceId,'edit_draft');
 return json({...time.data,canTrack:editAccess.ok&&access.workspaceLifecycle!=='archived',quoteStatus:control.data?.quote_status??'draft',actorId:access.actorId});
}
export const GET=handle;
export const POST=handle;
