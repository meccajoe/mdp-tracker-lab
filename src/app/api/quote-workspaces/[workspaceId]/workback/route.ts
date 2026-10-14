import {requireQuoteProductWorkspaceAccess} from '@/lib/ada-server';
import {canPerformQuoteAction} from '@/lib/quote-permissions';
import {labManagementGuard,managementJson as json} from '@/lib/quote-management-server';
import {loadWorkback,persistWorkback} from '@/lib/workback-server';
import {clientWorkback,workbackChanges} from '@/lib/workback';
import {renderWorkbackPdf} from '@/lib/workback-pdf';
export const dynamic='force-dynamic';
type Context={params:Promise<{workspaceId:string}>};
export async function GET(request:Request,{params}:Context){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const {workspaceId}=await params,a=await requireQuoteProductWorkspaceAccess(workspaceId);if(!a.ok)return a.response;
 try{const loaded=await loadWorkback(a.actorSupabase,workspaceId),workback=loaded.plan.workback??loaded.generated.workback;
  if(new URL(request.url).searchParams.get('format')==='pdf'){
   if(!loaded.plan.workback)return json({error:'Generate and save the workback before exporting.'},409);
   const pdf=await renderWorkbackPdf(clientWorkback(workback,loaded.workspace.title,loaded.workspace.client_name??''));
   return new Response(Buffer.from(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="Mecca-client-workback.pdf"','Cache-Control':'private, no-store'}});
  }
  const history=await a.actorSupabase.from('lab_production_schedule_revisions').select('revision,created_at,created_by_email').eq('workspace_id',workspaceId).order('revision',{ascending:false}).limit(30);
  return json({calendar:loaded.generated.calendar,workback,version:loaded.version,saved:Boolean(loaded.plan.workback),quoteVersion:loaded.quoteVersion,changes:workbackChanges(workback),client:clientWorkback(workback,loaded.workspace.title,loaded.workspace.client_name??''),history:history.data??[],canEdit:a.workspaceLifecycle!=='archived'&&canPerformQuoteAction(a.quoteActor,'edit_draft'),items:loaded.quote.lines.filter(l=>['Fabrication','Graphics','beMatrix / SEG','Props / Resale','Equipment Rental'].includes(l.type)).map(l=>({id:l.id,name:l.name})),stale:workback.proposed?.quoteVersion!==loaded.quoteVersion&&workback.current.quoteVersion!==loaded.quoteVersion});
 }catch(e){return json({error:e instanceof Error?e.message:'Workback could not load.'},503);}
}
export async function POST(request:Request,{params}:Context){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const {workspaceId}=await params,a=await requireQuoteProductWorkspaceAccess(workspaceId,'edit_draft');if(!a.ok)return a.response;
 try{const text=await request.text();if(new TextEncoder().encode(text).length>1500000)throw Error('Workback inputs too large.');const body=JSON.parse(text);if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0||!['generate','save','approve'].includes(body.action))throw Error('Invalid workback request.');
  const result=await persistWorkback(a.actorSupabase,workspaceId,a.actorId,a.actorEmail,{expectedVersion:body.expectedVersion,settings:body.settings,approve:body.action==='approve',force:true});return json(result);
 }catch(e){const message=e instanceof Error?e.message:'Workback could not save.';return json({error:message},message.includes('changed')?409:400);}
}
