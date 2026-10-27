import {canPerformQuoteAction} from '@/lib/quote-permissions';
import {requireQuoteProductWorkspaceAccess} from '@/lib/ada-server';
import {capacityVersions} from '@/lib/capacity-versions-server';
import {labManagementGuard,managementJson as json,managementError} from '@/lib/quote-management-server';
export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:Promise<{workspaceId:string}>}){const {workspaceId}=await params;const a=await requireQuoteProductWorkspaceAccess(workspaceId);if(!a.ok)return a.response;try{const rows=await capacityVersions(a.actorSupabase);return json({canSelect:a.workspaceLifecycle!=='archived'&&canPerformQuoteAction(a.quoteActor,'edit_draft'),entry:rows.get(workspaceId),members:[...rows.values()].filter(r=>r.group_id===rows.get(workspaceId)?.group_id)});}catch(e){return json({error:(e as Error).message},503);}}
export async function POST(request:Request,{params}:{params:Promise<{workspaceId:string}>}){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const {workspaceId}=await params,a=await requireQuoteProductWorkspaceAccess(workspaceId,'edit_draft');if(!a.ok)return a.response;
 const b=await request.json().catch(()=>null);if(!b||!['select','unselect','join','separate'].includes(b.action)||!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<0||(b.action==='join'&&!/^[0-9a-f-]{36}$/i.test(b.targetId??'')))return json({error:'Choose a valid project and reload before changing versions.'},400);
 const r=await a.actorSupabase.rpc('set_lab_capacity_version',{p_workspace_id:workspaceId,p_action:b.action,p_target_id:b.targetId??null,p_expected_version:b.expectedVersion});if(r.error)return managementError(r.error);return json({ok:true});
}
