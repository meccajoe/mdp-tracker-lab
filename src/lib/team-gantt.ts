import {capacityTrade} from './capacity-trades';
import type {TeamResult,TeamAllocation} from './team-schedule';
export type GanttGroup='Project'|'Trade'|'Person';
export type GanttResult=TeamResult&{projects:{id:string;name:string;status:string;start?:string;finish?:string}[]};
export type GanttRow={start?:string;finish?:string;preparation:NonNullable<TeamResult['preparation']>;id:string;name:string;caption:string;unassigned:number;futureHours:number;days:Map<string,TeamAllocation[]>;hours:number};
/** Presentation only: conserve assignments and keep projects with no staffed work visible. */
export function teamGanttRows(result:GanttResult,group:GanttGroup,filter:{project:string;person:string;trade:string;start?:string;finish?:string}){
 const rows=new Map<string,GanttRow>();
 const ensure=(id:string,name:string,caption='')=>{if(!rows.has(id))rows.set(id,{id,name,caption,unassigned:0,futureHours:0,days:new Map(),hours:0,preparation:[]});return rows.get(id)!;};
 const assignments=result.allocations.filter(a=>(!filter.start||a.date>=filter.start)&&(!filter.finish||a.date<=filter.finish)&&(!filter.project||a.workspaceId===filter.project)&&(!filter.person||a.personId===filter.person)&&(!filter.trade||capacityTrade(a.trade)===filter.trade));
 if(group==='Project')for(const p of result.projects)if(!filter.project||p.id===filter.project){const row=ensure(p.id,p.name,p.status);row.start=p.start;row.finish=p.finish;}
 if(group==='Person')for(const p of result.people)if(!filter.person||p.id===filter.person)ensure(p.id,p.name,p.primary);
 for(const a of assignments){const row=group==='Project'?ensure(a.workspaceId,a.project):group==='Trade'?ensure(capacityTrade(a.trade),capacityTrade(a.trade)):ensure(a.personId,a.person);
  row.days.set(a.date,[...(row.days.get(a.date)??[]),a]);row.hours+=a.hours;
 }
 // Unfilled work has no person or trustworthy assignment date; never draw invented bars.
 if(!filter.person)for(const u of result.unfilled){const projectId=u.taskKey.split('|')[0],trade=capacityTrade(u.trade);if(filter.project&&filter.project!==projectId||filter.trade&&filter.trade!==trade)continue;
  const row=group==='Project'?ensure(projectId,u.project):group==='Trade'?ensure(trade,trade):undefined;
  if(row){row.unassigned+=u.hours-(u.futureHours??0);row.futureHours+=u.futureHours??0;}
 }
 if(group!=='Person'&&!filter.person)for(const p of result.preparation??[]){
  const trade=p.kind==='CAD'?'CAD / Drawings':'Project Turnover';
  if(filter.project&&filter.project!==p.workspaceId||filter.trade&&filter.trade!==trade)continue;
  const daily=p.daily.filter(d=>(!filter.start||d.date>=filter.start)&&(!filter.finish||d.date<=filter.finish));
  if(!daily.length)continue;
  const row=group==='Project'?ensure(p.workspaceId,p.project):ensure(trade,trade);
  row.preparation.push({...p,daily});
 }
 return [...rows.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
