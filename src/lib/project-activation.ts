import {projectStatusFor} from './quote-schedule';
export type ActivationRevision={workspace_id:string;created_at:string;forecast_status:string|null;project_status:string|null;planning_status:string|null};
/** First saved Active state; later edits and reactivation do not reset project Day 0. */
export function activationDates(rows:ActivationRevision[]){
 const dates:Record<string,string>=Object.create(null);
 for(const row of rows){
  if(projectStatusFor({status:row.forecast_status??'',projectStatus:row.project_status??''},row.planning_status??'')!=='Active')continue;
  const instant=new Date(row.created_at);if(!Number.isFinite(instant.getTime()))continue;
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(instant);
  if(!dates[row.workspace_id]||date<dates[row.workspace_id])dates[row.workspace_id]=date;
 }
 return dates;
}
