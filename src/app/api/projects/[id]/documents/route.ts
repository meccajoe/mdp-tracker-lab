import {canPerformQuoteAction} from '@/lib/quote-permissions';
import {requireQuoteProductAccess,resolveQuoteWorkspaceAuthorization} from '@/lib/ada-server';
import {labManagementGuard,managementJson as json} from '@/lib/quote-management-server';
import {parseQuoteV27} from '@/lib/quote-v27-validation';
import {buildCadTurnover} from '@/lib/quote-cad-turnover';
import {renderCadTurnoverPdf} from '@/lib/quote-cad-pdf';
import {renderProjectDocument} from '@/lib/project-documents-pdf';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const a=await requireQuoteProductAccess();if(!a.ok)return a.response;
 const kind=new URL(request.url).searchParams.get('kind');if(!['per-diem','cad','bom'].includes(kind??''))return json({error:'Choose a project document.'},400);
 const {id}=await params;
 const source=await a.actorSupabase.from('lab_project_quote_sources').select('workspace_id,workbook_revision,snapshot').eq('project_id',id).maybeSingle();
 if(source.error)return json({error:'Project quote source could not load.'},503);if(!source.data)return json({error:'Quote-backed project not found.'},404);
 const s=source.data,auth=await resolveQuoteWorkspaceAuthorization(a,s.workspace_id);if(!auth.ok)return auth.response;if(!canPerformQuoteAction(auth.actor,'view_workspace'))return json({error:'Quote access required.'},403);
 const workbook=await a.actorSupabase.from('quote_workbook_revisions').select('document').eq('workspace_id',s.workspace_id).eq('revision',s.workbook_revision).maybeSingle();
 if(workbook.error||!workbook.data)return json({error:'The project’s exact quote revision is unavailable. No newer revision has been substituted.'},503);
 const project=await a.actorSupabase.from('projects').select('client,name').eq('id',id).maybeSingle();
 if(project.error||!project.data)return json({error:'Project could not load.'},503);
 try{const q=parseQuoteV27(workbook.data.document),meta={project:project.data.name||s.snapshot.title||'Project',client:project.data.client||'',revision:s.workbook_revision};
 const bytes=kind==='cad'?await renderCadTurnoverPdf(buildCadTurnover(q,{...meta,workspaceId:s.workspace_id,generatedAt:new Date().toISOString()})):await renderProjectDocument(q,meta,kind as 'per-diem'|'bom');
 return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${meta.project.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,80)}-${kind}-r${meta.revision}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return json({error:'This document could not be generated from the saved quote. Review its estimator details.'},422);}
}
