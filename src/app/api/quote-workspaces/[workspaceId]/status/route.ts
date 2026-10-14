import {persistWorkback} from '@/lib/workback-server';
import {parseQuoteV27} from '@/lib/quote-v27-validation';
import {buildCadTurnover} from '@/lib/quote-cad-turnover';
import {renderCadTurnoverPdf} from '@/lib/quote-cad-pdf';
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
 let pdfBase64:string|undefined,projectName='',clientName='';
 if(body.status==='final'){
  const [workbook,workspace]=await Promise.all([
   actor.actorSupabase.from('quote_workbook_revisions').select('document,revision').eq('workspace_id',workspaceId).eq('revision',body.expectedRevision).maybeSingle(),
   actor.actorSupabase.from('ada_quote_workspaces').select('title,client_name').eq('id',workspaceId).maybeSingle(),
  ]);
  if(workbook.error||workspace.error)return json({error:'Quote data could not load. Status has not changed.'},500);
  if(!workbook.data||!workspace.data)return json({error:'Save and reload the quote before marking Final.'},409);
  projectName=workspace.data.title;clientName=workspace.data.client_name??'';
  try{
   const report=buildCadTurnover(parseQuoteV27(workbook.data.document),{project:projectName,client:clientName,workspaceId,revision:body.expectedRevision,generatedAt:new Date().toISOString()});
   pdfBase64=Buffer.from(await renderCadTurnoverPdf(report)).toString('base64');
  }catch{return json({error:'CAD Turnover could not be generated. Status has not changed. Check the saved quote data and try again.'},422);}
 }
 if(body.status==='final'){try{await persistWorkback(actor.actorSupabase,workspaceId,actor.actorId,actor.actorEmail,{force:true});}catch(e){return json({error:e instanceof Error?e.message:'Workback generation failed; status unchanged.'},409);}}
 const result=pdfBase64!==undefined
  ?await actor.actorSupabase.rpc('finalize_lab_quote_with_cad',{p_workspace_id:workspaceId,p_expected_version:body.expectedVersion,p_expected_revision:body.expectedRevision,p_pdf_base64:pdfBase64,p_project_name:projectName,p_client_name:clientName}).single()
  :await actor.actorSupabase.rpc('set_lab_quote_status',{p_workspace_id:workspaceId,p_status:body.status,p_expected_version:body.expectedVersion,p_expected_revision:body.expectedRevision}).single();
 if(result.error&&['PGRST202','42883','42P01'].includes(result.error.code))return json({error:'CAD Turnover needs the lab database update. Status has not changed.'},503);
 if(result.error)return managementError(result.error);
 const saved=result.data as {quote_status:string;version:number};
 return json({status:saved.quote_status,version:saved.version});
}
