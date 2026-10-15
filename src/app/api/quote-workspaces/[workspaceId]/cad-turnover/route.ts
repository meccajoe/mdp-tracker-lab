import {parseQuoteV27} from '@/lib/quote-v27-validation';
import {buildCadTurnover} from '@/lib/quote-cad-turnover';
import {renderCadTurnoverPdf} from '@/lib/quote-cad-pdf';
import {requireQuoteProductWorkspaceAccess} from '@/lib/ada-server';
import {labManagementGuard,managementJson as json,missingManagement} from '@/lib/quote-management-server';

export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{workspaceId:string}>}) {
  const blocked=labManagementGuard();if(blocked)return blocked;
  const {workspaceId}=await params;
  const actor=await requireQuoteProductWorkspaceAccess(workspaceId);if(!actor.ok)return actor.response;
  const controls=await actor.actorSupabase.from('lab_quote_controls').select('quote_status,version').eq('workspace_id',workspaceId).maybeSingle();
  if(controls.error)return json({error:'Quote status could not load.'},503);
  const expected=new URL(request.url).searchParams.get('version');
  if(controls.data?.quote_status!=='final'||(expected!==null&&String(controls.data.version)!==expected))return json({error:'This quote changed or is no longer Final. Reload the Quotes page.'},409);
  const artifact=await actor.actorSupabase.from('lab_cad_turnovers')
    .select('project_name,client_name,workbook_revision,created_at').eq('workspace_id',workspaceId).eq('status_version',controls.data.version).maybeSingle();
  if(artifact.error)return json({error:missingManagement(artifact.error.code)?'CAD Turnover needs the lab database update.':'CAD Turnover could not load.'},503);
  // Render the current CAD-only presentation from the exact finalized revision.
  // Retain original stored PDFs and all quote revisions without rewriting either.
  const artifactMeta=artifact.data;
  let revisionQuery=actor.actorSupabase.from('quote_workbook_revisions').select('document,revision').eq('workspace_id',workspaceId);
  if(artifactMeta)revisionQuery=revisionQuery.eq('revision',artifactMeta.workbook_revision);
  const [workbook,workspace]=await Promise.all([
    revisionQuery.order('revision',{ascending:false}).limit(1).maybeSingle(),
    actor.actorSupabase.from('ada_quote_workspaces').select('title,client_name').eq('id',workspaceId).maybeSingle(),
  ]);
  if(workbook.error||workspace.error||!workbook.data||!workspace.data)return json({error:'The saved quote could not load for CAD Turnover.'},503);
  let saved;
  try{
    const report=buildCadTurnover(parseQuoteV27(workbook.data.document),{workspaceId,project:artifactMeta?.project_name??workspace.data.title,client:artifactMeta?.client_name??workspace.data.client_name??'',revision:workbook.data.revision,generatedAt:artifactMeta?.created_at??new Date().toISOString()});
    saved={pdf_base64:Buffer.from(await renderCadTurnoverPdf(report)).toString('base64'),project_name:report.project,workbook_revision:workbook.data.revision};
  }catch{return json({error:'CAD Turnover could not be generated from this saved quote.'},422);}
  const current=await actor.actorSupabase.from('lab_quote_controls').select('quote_status,version').eq('workspace_id',workspaceId).maybeSingle();
  if(current.error)return json({error:'Quote status could not be verified.'},503);
  if(current.data?.quote_status!=='final'||current.data.version!==controls.data.version)return json({error:'This quote changed. Reload the Quotes page.'},409);
  const bytes=Buffer.from(saved.pdf_base64,'base64');
  if(bytes.subarray(0,5).toString()!=='%PDF-')return json({error:'The saved CAD Turnover is invalid. Please contact the lab administrator.'},500);
  const name=saved.project_name.replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,100)||'Quote';
  return new Response(new Uint8Array(bytes),{headers:{
    'Content-Type':'application/pdf',
    'Content-Disposition':`attachment; filename="${name}-CAD-Turnover-r${saved.workbook_revision}.pdf"`,
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
  }});
}
