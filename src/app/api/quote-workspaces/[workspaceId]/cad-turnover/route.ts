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
    .select('pdf_base64,project_name,workbook_revision').eq('workspace_id',workspaceId).eq('status_version',controls.data.version).maybeSingle();
  if(artifact.error)return json({error:missingManagement(artifact.error.code)?'CAD Turnover needs the lab database update.':'CAD Turnover could not load.'},503);
  if(!artifact.data)return json({error:'No CAD Turnover was saved for this Final status. Switch to Draft, then mark Final again to generate it.'},409);
  const bytes=Buffer.from(artifact.data.pdf_base64,'base64');
  if(bytes.subarray(0,5).toString()!=='%PDF-')return json({error:'The saved CAD Turnover is invalid. Please contact the lab administrator.'},500);
  const name=artifact.data.project_name.replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,100)||'Quote';
  return new Response(new Uint8Array(bytes),{headers:{
    'Content-Type':'application/pdf',
    'Content-Disposition':`attachment; filename="${name}-CAD-Turnover-r${artifact.data.workbook_revision}.pdf"`,
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
  }});
}
