import {requireQuoteProductWorkspaceAccess} from '@/lib/ada-server';
import {labManagementGuard,managementJson as json} from '@/lib/quote-management-server';
import {EMPTY_SCHEDULE,parseSchedule} from '@/lib/quote-schedule';
import {persistWorkback} from '@/lib/workback-server';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{workspaceId:string}>}){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const {workspaceId}=await params;if(!/^[0-9a-f-]{36}$/i.test(workspaceId))return json({error:'Invalid quote ID.'},400);
 const access=await requireQuoteProductWorkspaceAccess(workspaceId,'edit_draft');if(!access.ok)return access.response;
 if(access.workspaceLifecycle==='archived')return json({error:'Restore this quote before changing its dates.'},403);
 let body;try{const raw=await request.text();if(raw.length>1000)throw Error();body=JSON.parse(raw);if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1||!body.dates||typeof body.dates!=='object'||Array.isArray(body.dates)||Object.keys(body.dates).some(key=>!['buildStart','buildFinish','dueDate','shipDate','installDate'].includes(key)))throw Error();}catch{return json({error:'Choose valid dates and a saved revision.'},400);}
 const latest=await access.actorSupabase.from('quote_workbook_revisions').select('document,revision,engine_version').eq('workspace_id',workspaceId).order('revision',{ascending:false}).limit(1).maybeSingle();
 if(latest.error)return json({error:'Quote could not load.'},500);
 if(!latest.data||latest.data.revision!==body.expectedVersion)return json({error:'The quote changed. Reload the list and try again.'},409);
 const document=structuredClone(latest.data.document);
 const prior=document.schedule??EMPTY_SCHEDULE;
 try{document.schedule=parseSchedule({...prior,...body.dates});}catch(error){return json({error:error instanceof Error?error.message:'Invalid dates.'},400);}
 const saved=await access.actorSupabase.from('quote_workbook_revisions').insert({workspace_id:workspaceId,revision:body.expectedVersion+1,document,engine_version:latest.data.engine_version,created_by:access.actorId,created_by_email:access.actorEmail}).select('revision').single();
 if(saved.error)return json({error:['PT409','23505'].includes(saved.error.code)?'Quote changed or date storage needs its lab update. Reload and try again.':'Dates could not save.'},['PT409','23505'].includes(saved.error.code)?409:403);
 let warning='';try{await persistWorkback(access.actorSupabase,workspaceId,access.actorId,access.actorEmail);}catch{warning='Dates saved. Workback refresh needs attention; regenerate its proposal.';}
 return json({version:saved.data.revision,warning});
}
