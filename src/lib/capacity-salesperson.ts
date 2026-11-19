import type {TeamResult} from './team-schedule';
import {matchesSalesperson} from './quote-salesperson';
type Source={workspaceId:string;document?:{salesperson?:string}|null};
export function salespersonProjectIds(projects:Source[],filter:string,selected:string[]|null=null):string[]|null{
 if(filter==='all')return selected;
 const selection=selected===null?null:new Set(selected);
 return projects.filter(p=>matchesSalesperson(p.document?.salesperson,filter)&&(!selection||selection.has(p.workspaceId))).map(p=>p.workspaceId);
}
export function filterTeamProjects<T extends TeamResult&{projects:{id:string;name:string;status:string}[]}>(result:T|undefined,ids:string[]|null):T|undefined{
 if(!result||ids===null)return result;
 const allowed=new Set(ids),projects=result.projects.filter(p=>allowed.has(p.id));
 const allocations=result.allocations.filter(a=>allowed.has(a.workspaceId));
 const unfilled=result.unfilled.filter(t=>allowed.has(t.taskKey.split('|')[0]));
 const assignedHours=allocations.reduce((n,a)=>n+a.hours,0);
 return {...result,projects,allocations,unfilled,assignedHours,totalHours:assignedHours+unfilled.reduce((n,t)=>n+t.hours,0),
  preparation:result.preparation?.filter(p=>allowed.has(p.workspaceId)),
  crewAdjustments:result.crewAdjustments?.filter(c=>allocations.some(a=>a.project===c.project&&a.item===c.item&&a.trade===c.trade&&a.date===c.date)),
  // Pressure and warnings retain all-project context: filtering never releases shared staff.
 };
}
