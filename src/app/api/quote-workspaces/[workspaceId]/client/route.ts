import {requireQuoteProductWorkspaceAccess} from '@/lib/ada-server';
export const dynamic='force-dynamic';
type Context={params:Promise<{workspaceId:string}>};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(_request:Request,{params}:Context){
 const {workspaceId}=await params,access=await requireQuoteProductWorkspaceAccess(workspaceId);if(!access.ok)return access.response;
 const r=await access.actorSupabase.from('ada_quote_workspaces').select('client_name').eq('id',workspaceId).single();
 return r.error?json({error:'Client could not load.'},500):json({clientName:r.data.client_name??''});
}
export async function PATCH(request:Request,{params}:Context){
 const {workspaceId}=await params,access=await requireQuoteProductWorkspaceAccess(workspaceId,'edit_draft');if(!access.ok)return access.response;
 const body=await request.json().catch(()=>null),name=body?.clientName;
 if(typeof name!=='string'||!name.trim()||name.trim().length>300)return json({error:'Client Name is required (up to 300 characters).'},400);
 const r=await access.actorSupabase.from('ada_quote_workspaces').select('title,client_name,contact_name,ada_project_id').eq('id',workspaceId).single();
 if(r.error)return json({error:'Quote metadata could not load.'},500);
 if(body.expectedClientName!==(r.data.client_name??''))return json({error:'Client was changed on another device. Reload before editing.'},409);
 const changed=await access.actorSupabase.rpc('update_ada_quote_workspace_metadata',{p_workspace_id:workspaceId,p_actor_email:access.actorEmail,p_title:r.data.title,p_client_name:name.trim(),p_contact_name:r.data.contact_name,p_ada_project_id:r.data.ada_project_id}).single();
 if(changed.error)return json({error:'Client could not be saved. Check quote editing access.'},changed.error.code==='42501'?403:409);
 return json({clientName:name.trim()});
}
