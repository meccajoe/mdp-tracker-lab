import {NextRequest} from 'next/server';
import {GET as adaGet,POST as adaPost} from '@/app/api/ada/workspaces/route';
import {requireQuoteProductAccess} from '@/lib/ada-server';
import {createBlankQuoteV27} from '@/lib/quote-v27-template';
import {quoteFromDefaults,requiredQuoteNames} from '@/lib/quote-defaults';
import {parseQuoteV27} from '@/lib/quote-v27-validation';
import {labManagementGuard,managementJson as json,managementError,missingManagement} from '@/lib/quote-management-server';
export async function GET(request:NextRequest){
 const actor=await requireQuoteProductAccess();if(!actor.ok)return actor.response;
 const response=await adaGet(request);if(!response.ok)return response;
 const payload=await response.json(),ids=(payload.workspaces??[]).map((w:{id:string})=>w.id);
 if(!ids.length){const check=await actor.actorSupabase.from('lab_quote_controls').select('workspace_id').limit(1);if(check.error&&!missingManagement(check.error.code))return json({error:'Quote controls could not load.'},500);return json({...payload,managementReady:!check.error});}
 const [controls,revisions]=await Promise.all([
  actor.actorSupabase.from('lab_quote_controls').select('workspace_id,quote_status,version,modified_at').in('workspace_id',ids),
  actor.actorSupabase.from('ada_quote_workspaces').select('id,quote_workbook_revisions(revision,created_at,forecast_status:document->schedule->>status,planning_status:document->planning->>status)').in('id',ids).order('revision',{referencedTable:'quote_workbook_revisions',ascending:false}).limit(1,{referencedTable:'quote_workbook_revisions'}),
 ]);
 if((controls.error&&!missingManagement(controls.error.code))||revisions.error)return json({error:'Quote status and modification dates could not load.'},500);
 return json({...payload,managementReady:!controls.error,workspaces:payload.workspaces.map((w:{id:string;updated_at:string;last_activity_at:string})=>{
  const c=controls.data?.find(row=>row.workspace_id===w.id),r=revisions.data?.find(row=>row.id===w.id)?.quote_workbook_revisions?.[0];
  return {...w,quote_status:c?.quote_status??'draft',status_version:c?.version??0,workbook_revision:r?.revision??0,forecast_status:r?.planning_status||r?.forecast_status||'',last_modified:[w.updated_at,w.last_activity_at,c?.modified_at,r?.created_at].filter(Boolean).sort().at(-1)};
 })});
}
export async function POST(request:NextRequest){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const actor=await requireQuoteProductAccess();if(!actor.ok)return actor.response;
 let body,names,document;
 try{const raw=await request.text();if(raw.length>1_900_000)throw new Error('Quote is too large.');body=JSON.parse(raw);names=requiredQuoteNames(body);if(body.initialDocument!==undefined)document=parseQuoteV27(body.initialDocument);}catch(e){return json({error:e instanceof Error?e.message:'Invalid quote.'},400);}
 const defaults=await actor.actorSupabase.from('lab_quote_settings_revisions').select('revision,document').order('revision',{ascending:false}).limit(1).maybeSingle();
 if(defaults.error){
  // Rollout compatibility: no global settings can exist until this relation exists.
  if(!missingManagement(defaults.error.code))return json({error:'Global settings could not load; no quote was created.'},503);
  return adaPost(new NextRequest(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({...body,...names})}));
 }
 let defaultsVersion:number|null=null;
 if(!document){try{document=defaults.data?quoteFromDefaults(defaults.data.document):createBlankQuoteV27();defaultsVersion=defaults.data?.revision??0;}catch{return json({error:'Global settings are invalid; no quote was created.'},422);}}
 if(typeof body.requestId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId))return json({error:'A creation request ID is required.'},400);
 const result=await actor.actorSupabase.rpc('create_lab_quote',{p_title:names.title,p_client_name:names.clientName,p_contact_name:typeof body.contactName==='string'?body.contactName:null,p_document:document,p_defaults_revision:defaultsVersion,p_request_id:body.requestId}).single();
 if(result.error)return managementError(result.error);
 return json({workspace:result.data,initialRevision:1},201);
}
