import {createHash,randomUUID} from 'node:crypto';
import {approvedCostingQuery} from './lab-approved-costing-query';
import {validateActivityCapture,type ActivityCapture} from './lab-project-activity';
import {validateProjectCosting,type ProjectCostingPacket} from './lab-project-costing';
import {PM_NAMES} from './types';
import {resolveHubSpotProjectManagerInitials} from './hubspot';

export const SOURCE_REF='yaftybqzlbbvzwwdzlny';
export const NORMALIZER_HASH='d0521f7b77d4bc826eaf3d1811a651d88b4796ae4b69f7050a6312a06e40cd49';
export type ApprovedSourceRules={definition:string;normalizerBody:string};
export const COST_VIEW_HASH='ce17aff3430b5491b21f66f9a51936ad66102137b19f5d807836d6a2a5f931c3';
export const sha=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export class SyncIssue extends Error {constructor(public code:string){super(code);}}
export type SourceQuery=(query:string)=>Promise<any[]>;
export function sourceReader(token:string,fetcher:typeof fetch=fetch):SourceQuery{
 if(!token.startsWith('sbp_fc'))throw new SyncIssue('SOURCE_SCOPED_READ_TOKEN_REQUIRED');
 return async query=>{
  // This endpoint enforces the database read-only role; there is no write fallback.
  const response=await fetcher(`https://api.supabase.com/v1/projects/${SOURCE_REF}/database/query/read-only`,{
   method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query}),
   redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000),
  });
  if(!response.ok)throw new SyncIssue('SOURCE_READ_FAILED');
  const text=await response.text();if(text.length>8_000_000)throw new SyncIssue('SOURCE_EXPORT_TOO_LARGE');
  let rows;try{rows=JSON.parse(text);}catch{throw new SyncIssue('SOURCE_INVALID_RESPONSE');}
  if(!Array.isArray(rows))throw new SyncIssue('SOURCE_INVALID_RESPONSE');return rows;
 };
}
export async function approvedDefinition(query:SourceQuery){
 const rows=await query("select pg_catalog.pg_get_viewdef('public.project_labor_reconciliation_summary'::regclass,true) definition, (select p.prosrc from pg_catalog.pg_proc p where p.oid='public.normalize_labor_worker_name(text)'::regprocedure) normalizer_body");
 const definition=rows[0]?.definition?.trim().replace(/\bpublic\.(qbo_labor_entries|labor_worker_cost_policies|labor_worker_rate_authority|labor_rate_imports|normalize_labor_worker_name)\b/g,'$1');
 if(typeof definition!=='string'||sha(definition)!==COST_VIEW_HASH)throw new SyncIssue('COSTING_RULES_CHANGED');
 const normalizerBody=rows[0]?.normalizer_body?.trim();
 if(typeof normalizerBody!=='string'||sha(normalizerBody)!==NORMALIZER_HASH)throw new SyncIssue('WORKER_NORMALIZER_RULES_CHANGED');
 return {definition,normalizerBody};
}
// Management read-only queries require schema-qualified persistent references.
export function qualifyCostDefinition(definition:string){
 return definition.replace(/(?<![\w.])(qbo_labor_entries|labor_worker_cost_policies|labor_worker_rate_authority|labor_rate_imports|normalize_labor_worker_name)\b/g,'public.$1');
}
// Preserve the exact approved SQL rules without executing a restricted user function.
// The body is read-only source metadata and must match the reviewed hash.
export function inlineWorkerNormalizer(definition:string,normalizerBody:string){
 if(sha(normalizerBody.trim())!==NORMALIZER_HASH)throw new SyncIssue('WORKER_NORMALIZER_RULES_CHANGED');
 const call='public.normalize_labor_worker_name(labor.employee_name)';
 if(!definition.includes(call))throw new SyncIssue('WORKER_NORMALIZER_CALL_CHANGED');
 const expression='('+normalizerBody.trim().replace(/;$/,'').replace(/\bworker_name\b/g,'labor.employee_name')+')';
 const result=definition.replaceAll(call,expression);
 if(result.includes('public.normalize_labor_worker_name('))throw new SyncIssue('WORKER_NORMALIZER_CALL_CHANGED');
 return result;
}
const literal=(v:string)=>"'"+v.replaceAll("'","''")+"'";
export function activityExportQuery(projectId:string,costingQuery:string){
 if(!/^[A-Za-z0-9-]+$/.test(projectId))throw new SyncIssue('INVALID_SOURCE_PROJECT');
 const id=literal(projectId);costingQuery=costingQuery.trim().replace(/;$/,'');
 return `select jsonb_build_object('activity',jsonb_build_object(
 'version',1,'source','production-tracker','capturedAt',now(),
 'project',jsonb_build_object('id',p.id,'name',p.name,'job_number',p.job_number,'hubspot_deal_id',p.hubspot_deal_id,'contract_amount',coalesce(p.contract_amount,0),'budget_hrs',p.budget_hrs,'budget_materials',p.budget_materials,'budget_design',p.budget_design,'budget_id_labor',p.budget_id_labor),
 'expenses',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'date',e.date,'category',e.category,'vendor',e.vendor,'amount',e.amount,'amount_pending',e.amount_pending,'flagged',e.flagged,'flag_note',e.flag_note,'notes',e.notes,'source',e.source,'external_id',e.external_id) order by e.id) from public.expenses e where e.project_id=${id}),'[]'::jsonb),
 'labor',coalesce((select jsonb_agg(jsonb_build_object('qbo_entry_id',l.qbo_entry_id,'employee_name',l.employee_name,'date',l.date,'service_item',l.service_item,'reg_hours',coalesce(l.reg_hours,0),'ot_hours',coalesce(l.ot_hours,0),'hourly_rate',l.hourly_rate,'rate_source',l.rate_source,'rate_verified_at',l.rate_verified_at) order by l.qbo_entry_id) from public.qbo_labor_entries l where l.project_id=${id} and l.qbo_entry_id like 'ts_%'),'[]'::jsonb),
 'manualLabor',coalesce((select jsonb_agg(to_jsonb(m)) from public.labor_entries m where m.project_id=${id}),'[]'::jsonb),
 'manualActuals',coalesce((select jsonb_agg(to_jsonb(m)) from public.project_actuals m where m.project_id=${id}),'[]'::jsonb)
 ),'costing',(select costing_export from (${costingQuery}) c)) export from public.projects p where p.id=${id}`;
}
export async function readActivity(query:SourceQuery,rules:ApprovedSourceRules,dealId:string,jobNumber:string){
 if(!/^\d+$/.test(dealId)||!/^\d+$/.test(jobNumber))throw new SyncIssue('MISSING_DEAL_OR_JOB');
 const matches=await query(`select p.id from public.projects p where p.hubspot_deal_id=${literal(dealId)} and p.job_number=${literal(jobNumber)}`);
 if(matches.length!==1)throw new SyncIssue('SOURCE_PROJECT_LINK_NOT_UNIQUE');
 const id=matches[0].id;
 if(typeof id!=='string'||!/^[A-Za-z0-9-]+$/.test(id))throw new SyncIssue('INVALID_SOURCE_PROJECT');
 // If time IDs change between these reads, exact packet coverage fails safely.
 const entries=await query(`select l.qbo_entry_id from public.qbo_labor_entries l where l.project_id=${literal(id)} and l.qbo_entry_id like 'ts_%' order by l.qbo_entry_id`);
 const costQuery=approvedCostingQuery(inlineWorkerNormalizer(qualifyCostDefinition(rules.definition),rules.normalizerBody),id,entries.map(r=>r.qbo_entry_id),true);
 const rows=await query(activityExportQuery(id,costQuery)),data=rows[0]?.export;
 if(rows.length!==1||!data?.costing)throw new SyncIssue('INCOMPLETE_ACTIVITY_EXPORT');
 const capture:ActivityCapture=data.activity;validateActivityCapture(capture);
 if(capture.project.id!==id||capture.project.job_number!==jobNumber||capture.project.hubspot_deal_id!==dealId)throw new SyncIssue('SOURCE_IDENTITY_CHANGED');
 const c=data.costing,summary=c.summary,activityId=randomUUID(),activityHash=sha(capture);
 const evidence:ProjectCostingPacket={version:1,activitySnapshotId:activityId,activitySourceSha256:activityHash,sourceProjectId:id,jobNumber,dealId,resolvedAt:c.resolvedAt,sourceView:'public.project_labor_reconciliation_summary',sourceViewSha256:COST_VIEW_HASH,sourceNormalizerSha256:NORMALIZER_HASH,
 expected:{rows:Number(summary.source_row_count??0),hours:Number(summary.total_hours??0),knownCost:Number(summary.verified_direct_wages??0),missingHours:Number(summary.missing_rate_hours??0),excludedHours:Number(summary.excluded_project_cost_hours??0)},rows:c.rows};
 validateProjectCosting(capture,evidence,activityId,activityHash);
 return {activityId,activityHash,capture,evidence,costingHash:sha(evidence)};
}
export async function readDeal(dealId:string,token:string,fetcher:typeof fetch=fetch){
 if(!/^\d+$/.test(dealId))throw new SyncIssue('MISSING_DEAL_OR_JOB');
 const response=await fetcher(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=dealname,job_number,account_manager,closedate,due_date,amount&associations=quotes`,{headers:{Authorization:`Bearer ${token}`},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new SyncIssue('HUBSPOT_READ_FAILED');
 const d=await response.json(),p=d.properties;
 if(d.id!==dealId||typeof p?.dealname!=='string'||!p.dealname.trim()||p.dealname.length>300||!/^\d+$/.test(p.job_number??''))throw new SyncIssue('HUBSPOT_INVALID_IDENTITY');
 if(!['closedate','due_date','account_manager','amount'].every(key=>Object.hasOwn(p,key)))throw new SyncIssue('HUBSPOT_FIELDS_MISSING');
 const date=(value:unknown)=>{if(value==null||value==='')return null;if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new SyncIssue('HUBSPOT_INVALID_DATE');return new Date(value).toISOString().slice(0,10);};
 const manager=p.account_manager||null,pm=manager?resolveHubSpotProjectManagerInitials(manager,Object.entries(PM_NAMES).map(([pm_initials,full_name])=>({pm_initials,full_name}))):null;
 if(manager&&!pm)throw new SyncIssue('HUBSPOT_PM_MAPPING_REQUIRED');
 const quotes=[];
 const association=d.associations?.quotes;
 if((association?.results?.length??0)>40)throw new SyncIssue('HUBSPOT_QUOTES_LIMIT');
 if(association?.paging?.next)throw new SyncIssue('HUBSPOT_QUOTES_TRUNCATED');
 for(const q of association?.results??[]){
  if(!/^\d+$/.test(q.id))throw new SyncIssue('HUBSPOT_INVALID_QUOTE');
  const r=await fetcher(`https://api.hubapi.com/crm/v3/objects/quotes/${q.id}?properties=hs_title,hs_status,hs_quote_amount,hs_quote_link,hs_pdf_download_link`,{headers:{Authorization:`Bearer ${token}`},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new SyncIssue(r.status===401||r.status===403?'HUBSPOT_QUOTE_ACCESS_DENIED':r.status===404?'HUBSPOT_QUOTE_NOT_FOUND':r.status===429?'HUBSPOT_QUOTE_RATE_LIMITED':'HUBSPOT_QUOTE_READ_FAILED');const quote=await r.json(),v=quote.properties;
  if(quote.id!==q.id||!v)throw new SyncIssue('HUBSPOT_INVALID_QUOTE');
  const total=v.hs_quote_amount==null||v.hs_quote_amount===''?null:Number(v.hs_quote_amount);if(total!=null&&!Number.isFinite(total))throw new SyncIssue('HUBSPOT_INVALID_QUOTE');
  quotes.push({id:q.id,title:v.hs_title||'Untitled quote',status:v.hs_status||'Unknown',total,url:v.hs_quote_link||null,pdf:v.hs_pdf_download_link||null});
 }
 const amount=p.amount==null||p.amount===''?null:Number(p.amount);if(amount!=null&&!Number.isFinite(amount))throw new SyncIssue('HUBSPOT_INVALID_AMOUNT');
 return {dealId,name:p.dealname,jobNumber:p.job_number,pm,closeDate:date(p.closedate),dueDate:date(p.due_date),hubspot:{amount,accountManager:manager,quotes,selectedQuoteId:null}};
}
