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
 let spans,paused:boolean|null=null,version:number|null=null;
 try{const text=request.method==='POST'?await request.text():'[]';if(text.length>30000)throw Error('Time log too large.');const body=JSON.parse(text);spans=parseQuoteTimeSpans(Array.isArray(body)?body:body.spans);if(!Array.isArray(body)&&body.paused!==undefined){if(typeof body.paused!=='boolean'||!Number.isInteger(body.pauseVersion)||body.pauseVersion<0)throw Error('Invalid pause state');paused=body.paused;version=body.pauseVersion;}}catch{return json({error:'Invalid time log.'},400);}
 const [time,control]=await Promise.all([
  access.actorSupabase.rpc('lab_quote_time_sync',{p_workspace_id:workspaceId,p_spans:spans,p_paused:paused,p_version:version}),
  access.actorSupabase.from('lab_quote_controls').select('quote_status').eq('workspace_id',workspaceId).maybeSingle(),
 ]);
 if(time.error?.code==='PT409')return json({error:'Timer changed on another device. Reloading its saved state.'},409);
 if(time.error||control.error)return json({error:'Quote timer could not sync. Recorded quote data is unchanged.'},503);
 const editAccess=await requireQuoteProductWorkspaceAccess(workspaceId,'edit_draft');
 return json({...time.data,canTrack:editAccess.ok&&access.workspaceLifecycle!=='archived',quoteStatus:control.data?.quote_status??'draft',actorId:access.actorId});
}
export const GET=handle;
export const POST=handle;
