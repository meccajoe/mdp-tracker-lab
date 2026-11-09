import {requireQuoteProductAccess,resolveQuoteWorkspaceAuthorization} from '@/lib/ada-server';
import {canPerformQuoteAction} from '@/lib/quote-permissions';
import {labManagementGuard,managementJson as json} from '@/lib/quote-management-server';
import {parseQuoteV27} from '@/lib/quote-v27-validation';
import {quotePerDiem} from '@/lib/quote-per-diem';
import {parsePerDiemRecipients} from '@/lib/per-diem-recipients';
export const dynamic='force-dynamic';
async function context(id:string){
 const blocked=labManagementGuard();if(blocked)return {ok:false as const,response:blocked};
 const a=await requireQuoteProductAccess();if(!a.ok)return a;
 const r=await a.actorSupabase.from('lab_project_quote_sources').select('workspace_id,workbook_revision').eq('project_id',id).maybeSingle();
 if(r.error||!r.data)return {ok:false as const,response:json({error:'Project quote source unavailable.'},r.error?503:404)};
 const auth=await resolveQuoteWorkspaceAuthorization(a,r.data.workspace_id);if(!auth.ok)return auth;
 if(!canPerformQuoteAction(auth.actor,'view_workspace'))return {ok:false as const,response:json({error:'Project access required.'},403)};
 return {...a,source:r.data,canEdit:canPerformQuoteAction(auth.actor,'edit_draft')};
}
export async function GET(_r:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,a=await context(id);if(!a.ok)return a.response;
 const [recipients,workbook]=await Promise.all([
 a.actorSupabase.from('lab_per_diem_recipient_revisions').select('version,names,created_at').eq('project_id',id).eq('workspace_id',a.source.workspace_id).eq('workbook_revision',a.source.workbook_revision).order('version',{ascending:false}).limit(1).maybeSingle(),
 a.actorSupabase.from('quote_workbook_revisions').select('document').eq('workspace_id',a.source.workspace_id).eq('revision',a.source.workbook_revision).maybeSingle()]);
 if(recipients.error||workbook.error||!workbook.data)return json({error:'Recipient assignments could not load. Retry before downloading.'},503);
 try{const report=quotePerDiem(parseQuoteV27(workbook.data.document));return json({source:a.source,version:recipients.data?.version??0,names:parsePerDiemRecipients(recipients.data?.names??{}),canEdit:a.canEdit,people:report.people.map(p=>({id:p.id,label:p.label,days:p.days,perDiem:p.perDiem,bonus:p.bonus})),warnings:report.warnings});}catch{return json({error:'Saved quote details could not be read.'},422);}
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,a=await context(id);if(!a.ok)return a.response;if(!a.canEdit)return json({error:'Editing access required to assign recipients.'},403);
 let body,names;try{const raw=await request.text();if(raw.length>4000)throw Error('Recipient names too large.');body=JSON.parse(raw);names=parsePerDiemRecipients(body.names);if(!Number.isSafeInteger(body.version)||body.version<0||body.version>=2147483647)throw Error('Invalid assignment version.');}catch(e){return json({error:e instanceof Error?e.message:'Invalid names.'},400);}
 if(body.workspaceId!==a.source.workspace_id||body.workbookRevision!==a.source.workbook_revision)return json({error:'Project quote baseline changed. Reload before assigning recipients.'},409);
 const r=await a.actorSupabase.from('lab_per_diem_recipient_revisions').insert({project_id:id,...a.source,version:body.version+1,names,created_by:a.actorId}).select('version,names').single();
 if(r.error)return json({error:['PT409','23505'].includes(r.error.code)?'Someone updated these recipients. Reload names before saving. Your edits remain here.':'Recipient names could not save. Your edits remain here.'},['PT409','23505'].includes(r.error.code)?409:503);
 return json(r.data);
}
