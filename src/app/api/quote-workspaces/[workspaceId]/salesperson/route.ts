import {requireQuoteProductWorkspaceAccess} from '@/lib/ada-server';
import {labManagementGuard,managementJson as json} from '@/lib/quote-management-server';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{workspaceId:string}>}){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const {workspaceId}=await params;if(!/^[0-9a-f-]{36}$/i.test(workspaceId))return json({error:'Invalid quote ID.'},400);
 const access=await requireQuoteProductWorkspaceAccess(workspaceId,'edit_draft');if(!access.ok)return access.response;
 if(access.workspaceLifecycle==='archived')return json({error:'Restore this quote before changing its salesperson.'},403);
 let body;try{const raw=await request.text();if(raw.length>2000)throw Error();body=JSON.parse(raw);if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1||typeof body.salesperson!=='string'||body.salesperson.length>200)throw Error();}catch{return json({error:'Enter a salesperson of at most 200 characters and a saved revision.'},400);}
 const latest=await access.actorSupabase.from('quote_workbook_revisions').select('document,revision,engine_version').eq('workspace_id',workspaceId).order('revision',{ascending:false}).limit(1).maybeSingle();
 if(latest.error)return json({error:'Quote could not load.'},500);
 if(!latest.data||latest.data.revision!==body.expectedVersion)return json({error:'The quote changed. Reload the list and try again.'},409);
 const salesperson=body.salesperson.trim();
 if((latest.data.document.salesperson??'')===salesperson)return json({version:latest.data.revision,salesperson});
 const document=structuredClone(latest.data.document);
 if(salesperson)document.salesperson=salesperson;else delete document.salesperson;
 const saved=await access.actorSupabase.from('quote_workbook_revisions').insert({workspace_id:workspaceId,revision:body.expectedVersion+1,document,engine_version:latest.data.engine_version,created_by:access.actorId,created_by_email:access.actorEmail}).select('revision').single();
 if(saved.error)return json({error:['PT409','23505'].includes(saved.error.code)?'Quote changed or Final quote metadata needs its lab update. Reload and try again.':'Salesperson could not save.'},['PT409','23505'].includes(saved.error.code)?409:403);
 return json({version:saved.data.revision,salesperson});
}
