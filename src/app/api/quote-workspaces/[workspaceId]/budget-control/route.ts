import {requireQuoteProductWorkspaceAccess} from '@/lib/ada-server';
import {canPerformQuoteAction} from '@/lib/quote-permissions';
import {labManagementGuard,managementJson as json} from '@/lib/quote-management-server';

type Context = {params:Promise<{workspaceId:string}>};
const workspacePattern=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function GET(_request:Request,{params}:Context){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const {workspaceId}=await params;
 if(!workspacePattern.test(workspaceId))return json({error:'Invalid quote ID.'},400);
 const access=await requireQuoteProductWorkspaceAccess(workspaceId);
 if(!access.ok)return access.response;
 const result=await access.supabase.rpc('lab_quote_budget_control',{p_workspace:workspaceId});
 if(result.error)return json({error:'Budget approval could not load.'},503);
 return json({...result.data,canEdit:access.workspaceLifecycle!=='archived'&&canPerformQuoteAction(access.quoteActor,'edit_draft')});
}

export async function POST(request:Request,{params}:Context){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const {workspaceId}=await params;
 if(!workspacePattern.test(workspaceId))return json({error:'Invalid quote ID.'},400);
 const access=await requireQuoteProductWorkspaceAccess(workspaceId,'edit_draft');
 if(!access.ok)return access.response;
 let revision:number,pending:boolean;
 try{
  const raw=await request.text();
  if(raw.length>1000)throw Error();
  ({revision,pending}=JSON.parse(raw));
  if(!Number.isSafeInteger(revision)||revision<1||revision>2147483647||typeof pending!=='boolean')throw Error();
 }catch{return json({error:'Choose an approval state and saved revision.'},400);}
 const result=await access.supabase.rpc('lab_quote_budget_control',{
  p_workspace:workspaceId,p_revision:revision,p_pending:pending,p_actor:access.actorId,
 });
 if(result.error?.code==='PT409')return json({error:'The saved quote changed. Reload and try again.'},409);
 if(result.error)return json({error:'Budget approval could not be updated.'},503);
 return json(result.data);
}
