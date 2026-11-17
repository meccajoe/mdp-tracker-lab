import {calculateQuoteV27} from './quote-v27';
import {parseQuoteV27} from './quote-v27-validation';
import {projectStatusFor} from './quote-schedule';
import {approvedDefinition,readActivity,readDeal,resolveProjectLink,sha,SyncIssue,type SourceQuery} from './lab-project-sync-source';
import {applyLabRateApprovals,type LabRateApproval} from './lab-project-rate-approvals';
export function chicagoClock(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const part=(key:string)=>parts.find(p=>p.type===key)!.value;
 return {day:`${part('year')}-${part('month')}-${part('day')}`,hour:Number(part('hour'))};
}
export function eligibleQuote(row:any){
 const forecast=row.document?.planning?.status||row.document?.schedule?.status;
 return ['Closed won','In production','Completed'].includes(forecast)&&['Active','Complete'].includes(projectStatusFor(row.document?.schedule,row.document?.planning?.status));
}
export function prepareBaseline(row:any,identity:any){
 const document=parseQuoteV27(row.document),calculation=calculateQuoteV27(document);
 return {schemaVersion:1,title:identity.name,schedule:document.schedule??{},sourceProjectStatus:projectStatusFor(document.schedule,document.planning?.status)==='Complete'?'Completed':'Active',laborRate:calculation.laborRate,lines:calculation.lines.filter(l=>l.name.trim()||l.finalPrice||l.buildBudget||l.hoursAllowed),totals:calculation.totals,warnings:[],hubspot:identity.hubspot};
}
export type SyncDb={rpc:(name:string,args?:any)=>PromiseLike<{data:any;error:any}>};
async function rpc(db:SyncDb,name:string,args?:any){const result=await db.rpc(name,args);if(result.error)throw new SyncIssue(result.error.code==='57014'?'LAB_DATABASE_TIMEOUT':'LAB_TRANSACTION_FAILED');return result.data;}
export async function runProjectSync({db,query,hubspotToken,mode,fetcher=fetch,now=()=>Date.now()}:{db:SyncDb;query:SourceQuery;hubspotToken:string;mode:'scheduled'|'manual'|'preview';fetcher?:typeof fetch;now?:()=>number}){
 const runId=await rpc(db,'lab_claim_project_sync',{p_mode:mode});if(!runId)return {skipped:true,reason:'ALREADY_RUNNING_OR_COMPLETE'};
 const started=now();
 const checkBudget=()=>{if(now()-started>240000)throw new SyncIssue('RUN_TIME_BUDGET');};
 const boundedQuery:SourceQuery=sql=>{checkBudget();return query(sql);};
 const boundedFetch:typeof fetch=(...args)=>{checkBudget();return fetcher(...args);};
 let fatal=false,fatalCode:string|null=null;
 try{
  const definition=await approvedDefinition(boundedQuery);
  const rateApprovals:LabRateApproval[]=await rpc(db,'lab_project_rate_approvals');
  if(!Array.isArray(rateApprovals))throw new SyncIssue('LAB_RATE_APPROVALS_UNAVAILABLE');
  const rows=await rpc(db,'lab_project_sync_scope_v2');
  if(!Array.isArray(rows)||rows.length>1000)throw new SyncIssue('SCOPE_TOO_LARGE_OR_INVALID');
  const scope=rows.filter(row=>row.project_id||eligibleQuote(row));
  if(new Set(scope.map(row=>row.group_id)).size!==scope.length)throw new SyncIssue('CONFLICTING_PROJECT_GROUP');
  // Three independent projects at a time; each project publishes in one RPC.
  for(let offset=0;offset<scope.length;offset+=3){
   checkBudget();
   const batch=await Promise.allSettled(scope.slice(offset,offset+3).map(async row=>{
    try{
     if(now()-started>240000)throw new SyncIssue('RUN_TIME_BUDGET');
     const link=row.project_id?{dealId:row.linked_deal_id,jobNumber:row.linked_job_number}:await resolveProjectLink(boundedQuery,row);
     const deal=link.dealId,job=link.jobNumber;
     if(!/^\d+$/.test(deal??'')||(row.project_id&&!/^\d+$/.test(job??'')))throw new SyncIssue('MISSING_DEAL_OR_JOB');
     if(!row.project_id&&scope.some(other=>other.group_id!==row.group_id&&((other.linked_deal_id||other.hubspot_deal_id)===deal||(job&&(other.linked_job_number||other.job_number)===job)||(!row.hubspot_deal_id&&!row.job_number&&!other.hubspot_deal_id&&!other.job_number&&typeof row.title==='string'&&typeof other.title==='string'&&row.title.trim().replace(/\s+/g,' ').toLowerCase()===other.title.trim().replace(/\s+/g,' ').toLowerCase()))))throw new SyncIssue('PROJECT_LINK_CONFLICT');
     const identity=await readDeal(deal,hubspotToken,boundedFetch);
     // Existing job-number corrections are allowed only after source identity agrees.
     if(!row.project_id&&job&&identity.jobNumber!==job)throw new SyncIssue('QUOTE_JOB_LINK_CHANGED');
     const activity=await readActivity(boundedQuery,definition,deal,identity.jobNumber);
     activity.evidence=applyLabRateApprovals(activity.capture,activity.evidence,rateApprovals,new Date(now()).toISOString());
     activity.costingHash=sha(activity.evidence);
     const document=row.project_id?row.document:await rpc(db,'lab_project_sync_document',{p_workspace:row.workspace_id,p_revision:row.revision});
     if(!document)throw new SyncIssue('QUOTE_REVISION_CHANGED');
     const baseline=row.project_id?null:prepareBaseline({...row,document},identity);
     if(mode==='preview'){
      await rpc(db,'lab_record_project_sync_result',{p_run:runId,p_scope:row.group_id,p_project:row.project_id??null,p_outcome:'preview',p_code:row.project_id?'WOULD_REFRESH':'WOULD_CREATE',p_details:{title:row.title,jobNumber:identity.jobNumber,revision:row.revision,expenses:activity.capture.expenses.length,timeRecords:activity.capture.labor.length,...activity.evidence.expected}});return;
     }
     await rpc(db,'lab_apply_project_sync',{p_run:runId,p_scope:row.group_id,p_payload:{
      workspaceId:row.workspace_id,expectedProjectId:row.project_id??null,expectedJobNumber:job,expectedTitle:row.title,revision:row.revision,document,
      identity,baseline,baselineHash:baseline?sha(baseline):null,activityId:activity.activityId,activityHash:activity.activityHash,activity:activity.capture,costing:activity.evidence,costingHash:activity.costingHash,
     }});
    }catch(error){
     await rpc(db,'lab_record_project_sync_result',{p_run:runId,p_scope:row.group_id,p_project:row.project_id??null,p_outcome:'exception',p_code:error instanceof SyncIssue?error.code:'VALIDATION_FAILED',p_details:{title:row.title,jobNumber:row.linked_job_number??row.job_number??null}});
    }
   }));
   if(batch.some(result=>result.status==='rejected'))throw new SyncIssue('RESULT_LOG_FAILED');
  }
 }catch(error){fatal=true;fatalCode=error instanceof SyncIssue?error.code:'RUN_FAILED';}
 await rpc(db,'lab_finish_project_sync',{p_run:runId,p_failed:fatal,p_code:fatalCode});
 return {runId,failed:fatal,preview:mode==='preview'};
}
