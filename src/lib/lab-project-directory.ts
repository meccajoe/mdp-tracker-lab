import {validateActivityCapture,summarizeProjectActivity} from './lab-project-activity';
import {healthMoney} from './lab-project-presentation';
export function directoryProject(source:any,activity:any){
 const p=source.projects,totals=source.snapshot.totals;
 let summary=null,capturedAt=null,activityState='not-imported';
 if(activity){
  if(activity.job_number!==p.job_number||activity.hubspot_deal_id!==p.hubspot_deal_id)activityState='link-changed';
  else try{validateActivityCapture(activity.snapshot);if(activity.snapshot.project.job_number!==p.job_number||activity.snapshot.project.hubspot_deal_id!==p.hubspot_deal_id)throw Error('identity');summary=summarizeProjectActivity(activity.snapshot);capturedAt=activity.captured_at;activityState=summary.complete?'complete':'incomplete';}catch{activityState='reconcile';}
 }
 return {...p,quotePrice:totals.price,buildBudget:totals.buildBudget,quotedHours:totals.hoursAllowed,revision:source.workbook_revision,activityState,capturedAt,...healthMoney(totals.buildBudget,summary)};
}
export type LabDirectoryProject=ReturnType<typeof directoryProject>;
