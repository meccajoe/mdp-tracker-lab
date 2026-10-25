import {requireQuoteProductWorkspaceAccess} from '@/lib/ada-server';
import {GET as workbookGet} from '../workbook/route';

export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{workspaceId:string}>}){
  const {workspaceId}=await context.params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId))return Response.json({error:'Invalid quote ID.'},{status:400});
  const actor=await requireQuoteProductWorkspaceAccess(workspaceId);if(!actor.ok)return actor.response;
  // Reuse workbook access/edit checks, including Final locking when that branch lands.
  const [workbook,workspace]=await Promise.all([
    workbookGet(new Request(new URL(`/api/quote-workspaces/${workspaceId}/workbook?activation=1`,request.url),{headers:request.headers}),context),
    actor.actorSupabase.from('ada_quote_workspaces').select('title,client_name').eq('id',workspaceId).maybeSingle(),
  ]);
  if(!workbook.ok)return workbook;
  if(workspace.error||!workspace.data)return Response.json({error:'Project details could not load.'},{status:500});
  const data=await workbook.json();
  return Response.json({workspace:workspace.data.title,client:workspace.data.client_name,document:data.document,activationDate:data.activationDate,version:data.version,canEdit:data.canEdit},{headers:{'Cache-Control':'private, no-store'}});
}
