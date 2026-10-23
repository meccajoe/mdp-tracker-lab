import {staffingTrade} from './capacity-trades';
import {dayNumber,dateString,monday,type RosterPerson} from './capacity';
import {isProductionDay,type ProductionCalendar} from './production-calendar';
import {validDate} from './quote-schedule';
export type TeamOptions={start:string;finish:string;priority:string[];availability:{personId:string;date:string;hours:number}[]};
export type TeamTask={key:string;workspaceId:string;project:string;item:string;trade:string;hours:number;start:string;finish:string;deadline:string;fixed:boolean;dailyLimit:number;predecessors:string[];lagDays?:number;calendar:ProductionCalendar;completed:string;external:boolean};
export type TeamPerson=Pick<RosterPerson,'id'|'name'|'primary'|'secondary'|'hours'|'active'>;
export type TeamAllocation={taskKey:string;workspaceId:string;project:string;item:string;trade:string;personId:string;person:string;date:string;hours:number;secondary:boolean;workMode?:'Regular'|'Weekday overtime'|'Weekend'};
export type TeamResult={allocations:TeamAllocation[];unfilled:{taskKey:string;project:string;item:string;trade:string;hours:number;reason:string}[];warnings:string[];people:TeamPerson[];options:TeamOptions;totalHours:number;assignedHours:number;regularAssignedHours?:number;pressure?:{trade:string;week:string;utilization:number;projects:string[]}[]};
const EPS=.000001;
export function parseTeamOptions(value:unknown):TeamOptions{
 const o=value as TeamOptions;
 if(!o||!validDate(o.start)||!validDate(o.finish)||o.finish<o.start||dayNumber(o.finish)-dayNumber(o.start)>365||!Array.isArray(o.priority)||o.priority.length>500||o.priority.some(id=>typeof id!=='string'||id.length>100)||new Set(o.priority).size!==o.priority.length||!Array.isArray(o.availability)||o.availability.length>3000)throw Error('Choose a date range of at most one year and valid scheduling options.');
 const availability=o.availability.map(a=>{if(!a||typeof a.personId!=='string'||!validDate(a.date)||a.date<o.start||a.date>o.finish||typeof a.hours!=='number'||!Number.isFinite(a.hours)||a.hours<0||a.hours>24)throw Error('Check employee availability dates and hours.');return {personId:a.personId,date:a.date,hours:a.hours};});
 if(new Set(availability.map(a=>a.personId+'|'+a.date)).size!==availability.length)throw Error('Use one availability entry per person per date.');
 return {start:o.start,finish:o.finish,priority:[...o.priority],availability};
}
const skill=(s:string)=>staffingTrade(s).trim().toLowerCase();
export function personDayHours(person:TeamPerson,date:string,options:TeamOptions){
 const override=options.availability.find(a=>a.personId===person.id&&a.date===date);
 const weekday=new Date(date+'T00:00:00Z').getUTCDay();
 return person.active?Math.min(24,person.hours/5,override?.hours??(weekday===0||weekday===6?0:person.hours/5)):0;
}
/** Deterministic daily allocation across the complete included workload; no commercial mutation. */
function schedulePass(tasks:TeamTask[],roster:TeamPerson[],options:TeamOptions,tier=0,weekdayExtra=2,recovery?:Set<string>):TeamResult{
 options=parseTeamOptions(options);
 if(tasks.length>5000||roster.length>300||new Set(tasks.map(t=>t.key)).size!==tasks.length||new Set(roster.map(p=>p.id)).size!==roster.length)throw Error('Schedule is too large or contains duplicate IDs.');
 for(const a of options.availability){const person=roster.find(p=>p.id===a.personId);if(!person||a.hours>Math.min(24,person.hours/5))throw Error('Availability cannot exceed the employee’s normal daily hours. Update the roster for a different workweek.');}
 const people=roster.filter(p=>p.active&&p.hours>0),allocations:TeamAllocation[]=[],warnings:string[]=[];
 const remaining=new Map(tasks.map(t=>[t.key,t.completed||t.external?0:t.hours]));
 const done=new Map(tasks.filter(t=>t.completed||t.external||t.hours<=EPS).map(t=>[t.key,t.completed||(t.hours<=EPS&&!t.external?dateString(dayNumber(options.start)-1):t.finish)]));
 const all=new Map(tasks.map(t=>[t.key,t]));
 const weekUsed=new Map<string,number>(),regularWeekUsed=new Map<string,number>();
 const ordered=[...tasks].sort((a,b)=>{
  const rank=(id:string)=>{const i=options.priority.indexOf(id);return i<0?options.priority.length:i;};
  return rank(a.workspaceId)-rank(b.workspaceId)||a.deadline.localeCompare(b.deadline)||a.finish.localeCompare(b.finish)||a.key.localeCompare(b.key);
 });
 for(const t of tasks){if(!validDate(t.start)||!validDate(t.finish)||!validDate(t.deadline)||!Number.isFinite(t.hours)||t.hours<0||!Number.isFinite(t.dailyLimit)||t.dailyLimit<=0)throw Error('Invalid task hours.');if(t.external&&!t.completed)warnings.push(`${t.project}: CAD prerequisite uses its planned finish (${t.finish||'missing'}); confirm readiness.`);}
 for(let day=dayNumber(options.start);day<=dayNumber(options.finish);day++){
  const date=dateString(day),weekday=new Date(date+'T00:00:00Z').getUTCDay(),weekend=weekday===0||weekday===6,extra=tier>0&&!weekend?weekdayExtra:0,weekendAllowed=weekday===6?tier>=2:weekday===0?tier>=3:false,dailyUsed=new Map<string,number>(),taskUsed=new Map<string,number>();
  // Primary assignments across all jobs first; secondary skills only use remaining person-hours.
  for(const secondary of [false,true])for(const task of ordered){
   const recover=recovery?.has(task.key)??true,taskExtra=recover?extra:0,taskWeekend=weekendAllowed&&recover;
   if((remaining.get(task.key)??0)<=EPS||task.external||date<task.start||date>task.deadline||task.fixed&&date>task.finish||(!isProductionDay(day,task.calendar)&&!(taskWeekend&&!task.calendar.holidays?.includes(date))))continue;
   if(task.predecessors.some(id=>{const completed=done.get(id);if(!all.has(id)||!completed||completed>=date)return true;let gap=0;for(let d=dayNumber(completed)+1;d<day;d++)if(isProductionDay(d,task.calendar))gap++;return gap<(task.lagDays??0);}))continue;
   const eligible=people.filter(p=>secondary?skill(p.primary)!==skill(task.trade)&&skill(p.secondary)===skill(task.trade):skill(p.primary)===skill(task.trade)).sort((a,b)=>(dailyUsed.get(a.id)??0)-(dailyUsed.get(b.id)??0)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
   for(const person of eligible){
    const weekKey=person.id+'|'+monday(date),normal=personDayHours(person,date,options),exception=options.availability.find(a=>a.personId===person.id&&a.date===date);
    // Saved absence/short-day limits are hard limits, including on weekends.
    const dailyCap=Math.min(24,exception?normal:taskWeekend?Math.min(8,person.hours/5):normal+taskExtra);
    const weeklyCap=person.hours+(tier>0?weekdayExtra*5:0)+(tier>=2?Math.min(8,person.hours/5):0)+(tier>=3?Math.min(8,person.hours/5):0);
    const used=dailyUsed.get(person.id)??0,room=Math.min(dailyCap-used,weeklyCap-(weekUsed.get(weekKey)??0),task.dailyLimit+taskExtra-(taskUsed.get(task.key)??0));
    const hours=Math.min(remaining.get(task.key)??0,room);if(hours<=EPS)continue;
    const base={taskKey:task.key,workspaceId:task.workspaceId,project:task.project,item:task.item,trade:task.trade,personId:person.id,person:person.name,date,secondary};
    const regular=weekend?0:Math.min(hours,Math.max(0,normal-used),Math.max(0,person.hours-(regularWeekUsed.get(weekKey)??0)));
    regularWeekUsed.set(weekKey,(regularWeekUsed.get(weekKey)??0)+regular);
    if(regular>EPS)allocations.push({...base,hours:regular,workMode:'Regular'});
    if(hours-regular>EPS)allocations.push({...base,hours:hours-regular,workMode:weekend?'Weekend':'Weekday overtime'});
    if(allocations.length>50000)throw Error('Too many assignments. Shorten the date range.');
    dailyUsed.set(person.id,(dailyUsed.get(person.id)??0)+hours);weekUsed.set(weekKey,(weekUsed.get(weekKey)??0)+hours);taskUsed.set(task.key,(taskUsed.get(task.key)??0)+hours);remaining.set(task.key,(remaining.get(task.key)??0)-hours);
    if((remaining.get(task.key)??0)<=EPS){done.set(task.key,date);break;}
   }
  }
 }
 const unfilled=tasks.filter(t=>!t.external&&(remaining.get(t.key)??0)>EPS).map(t=>({taskKey:t.key,project:t.project,item:t.item,trade:t.trade,hours:remaining.get(t.key)!,reason:t.predecessors.some(id=>!done.get(id))?'Prerequisite unfinished or missing':!people.some(p=>skill(p.primary)===skill(t.trade)||skill(p.secondary)===skill(t.trade))?'No active employee with this trade':t.deadline<options.start?'Build deadline is before this schedule':t.start>options.finish?'Task starts beyond this schedule':t.fixed?'Insufficient availability inside fixed task dates':'Insufficient eligible hours before deadline or end of view'}));
 return {allocations,unfilled,warnings:[...new Set(warnings)],people,options,totalHours:tasks.filter(t=>!t.external&&!t.completed).reduce((n,t)=>n+t.hours,0),assignedHours:allocations.reduce((n,a)=>n+a.hours,0)};
}
/** Recalculate the entire shared workload at each level; never add a second staff budget per project. */
export function scheduleTeam(tasks:TeamTask[],roster:TeamPerson[],options:TeamOptions):TeamResult{
 return schedulePass(tasks,roster,options);
}
export function scheduleTeamWithOvertime(tasks:TeamTask[],roster:TeamPerson[],options:TeamOptions):TeamResult{
 const regular=schedulePass(tasks,roster,options);
 let best=regular;
 const recovery=new Set(regular.unfilled.map(t=>t.taskKey)),byKey=new Map(tasks.map(t=>[t.key,t]));
 const includePredecessors=(key:string)=>{for(const predecessor of byKey.get(key)?.predecessors??[]){if(!recovery.has(predecessor)){recovery.add(predecessor);includePredecessors(predecessor);}}};
 for(const key of [...recovery])includePredecessors(key);
 for(const tier of [1,2,3]){
  if(best.unfilled.length===0)break;
  const candidate=schedulePass(tasks,roster,options,tier,2,recovery);
  const extra=(r:TeamResult)=>r.allocations.filter(a=>a.workMode!=='Regular').reduce((n,a)=>n+a.hours,0);
  if(candidate.assignedHours>best.assignedHours+EPS||Math.abs(candidate.assignedHours-best.assignedHours)<EPS&&extra(candidate)<extra(best))best=candidate;
 }
 const pressure:NonNullable<TeamResult['pressure']>=[];
 const groups=new Map<string,TeamAllocation[]>();
 for(const a of regular.allocations){const key=skill(a.trade)+'|'+monday(a.date);groups.set(key,[...(groups.get(key)??[]),a]);}
 for(const [key,entries] of groups){
  const [trade,week]=key.split('|'),people=roster.filter(p=>skill(p.primary)===trade||skill(p.secondary)===trade);
  let available=0;for(const p of people){let days=0;for(let d=Math.max(dayNumber(week),dayNumber(options.start));d<=Math.min(dayNumber(week)+6,dayNumber(options.finish));d++)days+=personDayHours(p,dateString(d),options);available+=Math.min(p.hours,days);}
  const ids=new Set(people.map(p=>p.id));
  const used=regular.allocations.filter(a=>ids.has(a.personId)&&monday(a.date)===week).reduce((n,a)=>n+a.hours,0);
  if(available>0&&used/available>=.85)pressure.push({trade:entries[0].trade,week,utilization:used/available,projects:[...new Set(tasks.filter(t=>!t.external&&!t.completed&&t.hours>EPS&&people.some(p=>skill(p.primary)===skill(t.trade)||skill(p.secondary)===skill(t.trade))&&t.start<=dateString(dayNumber(week)+6)&&t.deadline>=week).map(t=>t.project))]});
 }
 return {...best,regularAssignedHours:regular.assignedHours,pressure};
}
export function sameTeamSources(a:unknown,b:unknown){
 const canonical=(value:unknown)=>{const s=value as {roster:number;quotes:{id:string;quote:number;plan:number}[]};return JSON.stringify([s.roster,s.quotes.map(q=>[q.id,q.quote,q.plan]).sort((x,y)=>String(x[0]).localeCompare(String(y[0])))]);};
 try{return canonical(a)===canonical(b);}catch{return false;}
}
