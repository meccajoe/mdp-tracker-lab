import {requireQuoteProductWorkspaceAccess} from '@/lib/ada-server';
import {canPerformQuoteAction} from '@/lib/quote-permissions';
import {labManagementGuard,managementJson as json,managementError} from '@/lib/quote-management-server';
type Context={params:Promise<{workspaceId:string}>};
export async function GET(_request:Request,{params}:Context){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const {workspaceId}=await params,actor=await requireQuoteProductWorkspaceAccess(workspaceId);if(!actor.ok)return actor.response;
 const [result,revision]=await Promise.all([actor.actorSupabase.from('lab_quote_controls').select('quote_status,version').eq('workspace_id',workspaceId).maybeSingle(),actor.actorSupabase.from('quote_workbook_revisions').select('revision').eq('workspace_id',workspaceId).order('revision',{ascending:false}).limit(1).maybeSingle()]);
 if(result.error)return managementError(result.error);if(revision.error)return json({error:'Latest revision could not load.'},500);
 return json({status:result.data?.quote_status??'draft',version:result.data?.version??0,revision:revision.data?.revision??0,canEdit:actor.workspaceLifecycle!=='archived'&&canPerformQuoteAction(actor.quoteActor,'edit_draft')});
}
export async function POST(request:Request,{params}:Context){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const {workspaceId}=await params,actor=await requireQuoteProductWorkspaceAccess(workspaceId,'edit_draft');if(!actor.ok)return actor.response;
 const body=await request.json().catch(()=>({}));
 if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid request.'},400);
 if(!['draft','final'].includes(body.status)||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)return json({error:'Invalid quote status request.'},400);
 const result=await actor.actorSupabase.rpc('set_lab_quote_status',{p_workspace_id:workspaceId,p_status:body.status,p_expected_version:body.expectedVersion,p_expected_revision:body.expectedRevision}).single();
 if(result.error)return managementError(result.error);
 const saved=result.data as {quote_status:string;version:number};
 return json({status:saved.quote_status,version:saved.version});
}
