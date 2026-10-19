import {capacityTrade} from './capacity-trades';
import type {TeamResult,TeamAllocation} from './team-schedule';
export type GanttGroup='Project'|'Trade'|'Person';
export type GanttResult=TeamResult&{projects:{id:string;name:string;status:string}[]};
export type GanttRow={id:string;name:string;caption:string;unassigned:number;days:Map<string,TeamAllocation[]>;hours:number};
/** Presentation only: conserve assignments and keep projects with no staffed work visible. */
export function teamGanttRows(result:GanttResult,group:GanttGroup,filter:{project:string;person:string;trade:string}){
 const rows=new Map<string,GanttRow>();
 const ensure=(id:string,name:string,caption='')=>{if(!rows.has(id))rows.set(id,{id,name,caption,unassigned:0,days:new Map(),hours:0});return rows.get(id)!;};
 const assignments=result.allocations.filter(a=>(!filter.project||a.workspaceId===filter.project)&&(!filter.person||a.personId===filter.person)&&(!filter.trade||capacityTrade(a.trade)===filter.trade));
 if(group==='Project')for(const p of result.projects)if(!filter.project||p.id===filter.project)ensure(p.id,p.name,p.status);
 if(group==='Person')for(const p of result.people)if(!filter.person||p.id===filter.person)ensure(p.id,p.name,p.primary);
 for(const a of assignments){const row=group==='Project'?ensure(a.workspaceId,a.project):group==='Trade'?ensure(capacityTrade(a.trade),capacityTrade(a.trade)):ensure(a.personId,a.person);
  row.days.set(a.date,[...(row.days.get(a.date)??[]),a]);row.hours+=a.hours;
 }
 // Unfilled work has no person or trustworthy assignment date; never draw invented bars.
 if(!filter.person)for(const u of result.unfilled){const projectId=u.taskKey.split('|')[0],trade=capacityTrade(u.trade);if(filter.project&&filter.project!==projectId||filter.trade&&filter.trade!==trade)continue;
  if(group==='Project')ensure(projectId,u.project).unassigned+=u.hours;
  else if(group==='Trade')ensure(trade,trade).unassigned+=u.hours;
 }
 return [...rows.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
