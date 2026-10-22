import {requireQuoteProductWorkspaceAccess} from '@/lib/ada-server';
import {parseQuoteV27} from '@/lib/quote-v27-validation';
import {cloneQuoteDocument,requiredQuoteNames} from '@/lib/quote-defaults';
import {labManagementGuard,managementJson as json,managementError} from '@/lib/quote-management-server';
export async function POST(request:Request,{params}:{params:Promise<{workspaceId:string}>}){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const {workspaceId}=await params,actor=await requireQuoteProductWorkspaceAccess(workspaceId);if(!actor.ok)return actor.response;
 const body=await request.json().catch(()=>({}));
 if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid request.'},400);
 if(typeof body.requestId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId))return json({error:'A clone request ID is required.'},400);
 const [source,latest]=await Promise.all([actor.actorSupabase.from('ada_quote_workspaces').select('title,client_name,contact_name').eq('id',workspaceId).single(),actor.actorSupabase.from('quote_workbook_revisions').select('revision,document').eq('workspace_id',workspaceId).order('revision',{ascending:false}).limit(1).maybeSingle()]);
 if(source.error||latest.error)return json({error:'Source quote could not load.'},500);
 if(!latest.data)return json({error:'Save the source quote before cloning it.'},409);
 let names,document;
 try{names=requiredQuoteNames({title:body.title===undefined?source.data.title+' CLONE':body.title,clientName:body.clientName??source.data.client_name});document=cloneQuoteDocument(parseQuoteV27(latest.data.document),body.copySchedule===true);}catch(e){return json({error:e instanceof Error?e.message:'Invalid source quote.'},400);}
 const result=await actor.actorSupabase.rpc('create_lab_quote',{p_title:names.title,p_client_name:names.clientName,p_contact_name:source.data.contact_name,p_document:document,p_defaults_revision:null,p_request_id:body.requestId,p_source_id:workspaceId,p_source_revision:latest.data.revision}).single();
 if(result.error)return managementError(result.error);
 return json({workspace:result.data},201);
}
