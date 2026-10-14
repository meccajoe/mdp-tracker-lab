import {parseWorkback,type Workback} from './workback-model';
import {calculateQuoteV27,type QuoteV27} from './quote-v27';
import {stageForTrade} from './item-timeline';
import {productionDays,WEEKDAYS,parseProductionCalendar,type ProductionCalendar} from './production-calendar';
import {validDate} from './quote-schedule';

export const PLAN_ENGINE='item-flow-1';
export const FLOW=['cad','purchasing','cnc','carpentry','finish','graphics','packing','other'] as const;
export type PlanStage=typeof FLOW[number];
export const STAGE_NAMES:Record<PlanStage,string>={cad:'CAD / Drawings',purchasing:'Purchasing / Ramp up',cnc:'CNC',carpentry:'Carpentry / Assembly',finish:'Finish / Paint',graphics:'Graphics',packing:'Final Prep / Packing',other:'Unassigned / other'};
export type PlanTask={id:string;itemId:string;item:string;stage:PlanStage;trade:string;hours:number;start:string;finish:string;daily:{date:string;hours:number}[];predecessors:string[];locked:boolean};
export type TaskRule={start?:string;finish?:string;locked?:boolean;dailyHours?:number;lagDays?:number;remainingHours?:number;predecessors?:string[]};
export type TaskActual={completed:string;hours:number|null;reason:string;notes:string};
export type ProductionPlan={workback?:Workback;engine:string;quoteVersion:number;status:'proposed'|'approved';calendar:ProductionCalendar;rampDays:number;rules:Record<string,TaskRule>;tasks:PlanTask[];baseline:PlanTask[];actuals:Record<string,TaskActual>;notes:string};
export const emptyPlan=():ProductionPlan=>({engine:PLAN_ENGINE,quoteVersion:0,status:'proposed',calendar:{...WEEKDAYS},rampDays:1,rules:{},tasks:[],baseline:[],actuals:{},notes:''});
export type PlannerRoster={primary:string;hours:number;active:boolean}[];
const day=(date:string)=>Date.parse(date+'T00:00:00Z')/86400000;
const iso=(n:number)=>new Date(n*86400000).toISOString().slice(0,10);
const sum=(values:number[])=>values.reduce((a,b)=>a+b,0);
const shopTypes=new Set(['Fabrication','Graphics','beMatrix / SEG','Stage / Pack / Prep','Disposal','Props / Resale']);

/** Pure proposal generation. Never changes a quote, reserves staff across jobs or shifts its deadline. */
export function proposeProductionPlan(quote:QuoteV27,roster:PlannerRoster,options:ProductionPlan=emptyPlan()){
 const warnings:string[]=[],tasks:PlanTask[]=[],calculation=calculateQuoteV27(quote);
 const schedule=quote.schedule,calendar=options.calendar,days=schedule?productionDays(schedule.buildStart,schedule.buildFinish,calendar):[];
 if(!days.length)return {tasks,warnings:['Enter valid build start and finish dates to generate a schedule.'],lateHours:0,unassignedHours:0};
 const workdays=productionDays(iso(days[0]),iso(Math.min(day('2200-12-31'),days[0]+1095)),calendar);
 const rosterHours:Record<string,number>=Object.create(null);
 for(const person of roster)if(person.active)rosterHours[person.primary]=(rosterHours[person.primary]??0)+person.hours/5;
 const seeds:{id:string;itemId:string;item:string;stage:PlanStage;trade:string;hours:number}[]=[];
 for(const line of calculation.lines){
  if(!shopTypes.has(line.type)&&line.type!=='Design / Engineering / CAD')continue;
  const trades:Record<string,number>=Object.create(null);
  for(const row of calculation.takeoffs.filter(r=>r.lineId===line.id&&r.extendedHours>0)){
   const matches=quote.trades.filter(t=>row.tradeId?t.id===row.tradeId:t.name.toLowerCase()===row.description.toLowerCase());
   if(matches.length===1)trades[matches[0].name]=(trades[matches[0].name]??0)+row.extendedHours;
  }
  if(line.type==='Design / Engineering / CAD'){for(const key of Object.keys(trades))delete trades[key];trades['CAD / Drawings']=line.hoursAllowed;}
  if(line.type==='Stage / Pack / Prep'&&!Object.keys(trades).length)trades['Crate & pack']=line.hoursAllowed;
  if(line.type==='Graphics'&&!Object.keys(trades).length)trades.Graphics=line.hoursAllowed;
  const assigned=sum(Object.values(trades));
  if(assigned>line.hoursAllowed+.000001)warnings.push(`${line.name}: trade hours exceed allowed hours. Reconcile the quote before approving.`);
  if(line.hoursAllowed>assigned+.000001)trades['Unassigned shop hours']=line.hoursAllowed-assigned;
  for(const [trade,hours] of Object.entries(trades))if(hours>0)seeds.push({id:line.id+'::'+trade,itemId:line.id,item:line.name,stage:line.type==='Design / Engineering / CAD'?'cad':stageForTrade(trade)??'other',trade,hours});
 }
 if(!seeds.length)warnings.push('No quoted labor yet. The six-stage percentage timeline remains the planning reference; no labor has been invented.');
 const booked:Record<string,Map<number,number>>=Object.create(null);
 const placed=new Map<string,PlanTask>();
 const ordered=seeds.toSorted((a,b)=>FLOW.indexOf(a.stage)-FLOW.indexOf(b.stage));
 const remaining=[...ordered];
 const defaultDependencies=(seed:typeof seeds[number])=>{
  if(seed.stage==='cad'||seed.stage==='other')return [];
  const rank=FLOW.indexOf(seed.stage),prior=seeds.filter(s=>s.itemId===seed.itemId&&s.stage!=='other'&&s.stage!=='cad'&&(seed.stage==='graphics'?FLOW.indexOf(s.stage)<FLOW.indexOf('finish'):FLOW.indexOf(s.stage)<rank));
  // Finishing and graphics can run together; packing waits for both.
  return [...seeds.filter(s=>s.stage==='cad').map(s=>s.id),...prior.map(s=>s.id)];
 };
 while(remaining.length){
  const index=remaining.findIndex(seed=>(options.rules[seed.id]?.predecessors??defaultDependencies(seed)).every(id=>placed.has(id)));
  if(index<0){warnings.push('Unresolved or cyclic dependencies: '+remaining.map(s=>s.item).join(', '));break;}
  const seed=remaining.splice(index,1)[0],rule=options.rules[seed.id]??{},dependencies=rule.predecessors??defaultDependencies(seed);
  let earliest=seed.stage==='cad'?0:options.rampDays;
  for(const id of dependencies){const prior=placed.get(id)!;if(prior.hours===0)continue;if(!prior.finish||sum(prior.daily.map(d=>d.hours))<prior.hours-1e-8){earliest=workdays.length;continue;}earliest=Math.max(earliest,workdays.indexOf(day(prior.finish))+1+(rule.lagDays??0)+(prior.stage==='cad'&&seed.stage!=='cad'?options.rampDays:0));}
  if(rule.start){const requested=day(rule.start),index=workdays.findIndex(d=>d>=requested);earliest=Math.max(earliest,index<0?workdays.length:index);}
  const hours=rule.remainingHours??seed.hours;
  const available=rosterHours[seed.trade];
  const dailyLimit=rule.dailyHours??Math.min(quote.settings.shopDay||8,available||quote.settings.shopDay||8);
  if(available===undefined||available===0)warnings.push(`${seed.trade}: no active primary-trade staffing; assuming ${dailyLimit} crew-hours/day for timing only.`);
  const budget=available&&available>0?available:dailyLimit;
  booked[seed.trade]??=new Map();
  let allocation:{date:string;hours:number}[]=[];
  if(hours===0){allocation=[];}else if(rule.locked&&rule.start&&rule.finish){
   const dates=productionDays(rule.start,rule.finish,calendar);
   allocation=dates.map(d=>({date:iso(d),hours:hours/dates.length}));
   if(dates.length&&dates[0]<(workdays[earliest]??Infinity))warnings.push(`${seed.item} / ${seed.trade}: locked dates violate a prerequisite or lead time.`);
  }else{
   let left=hours;
   for(let i=Math.max(0,earliest);i<workdays.length&&left>1e-8;i++){
    const d=workdays[i],room=Math.max(0,Math.min(dailyLimit,budget-(booked[seed.trade].get(d)??0))),take=Math.min(left,room);
    if(take>0){allocation.push({date:iso(d),hours:take});left-=take;}
   }
   if(left>1e-8)warnings.push(`${seed.item} / ${seed.trade}: ${left} hours exceed the three-year planning horizon and remain unscheduled.`);
  }
  for(const a of allocation){const d=day(a.date);booked[seed.trade].set(d,(booked[seed.trade].get(d)??0)+a.hours);if(available!==undefined&&(booked[seed.trade].get(d)??0)>available+.000001)warnings.push(`${seed.trade}: planned hours exceed staffing on ${a.date}.`);}
  const task:PlanTask={...seed,hours,predecessors:dependencies,locked:Boolean(rule.locked),daily:allocation,start:allocation[0]?.date??'',finish:allocation.at(-1)?.date??''};
  tasks.push(task);placed.set(task.id,task);
 }
 const lateHours=sum(tasks.flatMap(t=>t.daily.filter(d=>d.date>(schedule?.buildFinish??'')).map(d=>d.hours)));
 if(lateHours>0)warnings.push(`${lateHours.toFixed(1)} hours fall after Build finish. The quoted deadline has not changed; adjust staffing, sequence or dates.`);
 if(Object.keys(options.rules).some(id=>!seeds.some(s=>s.id===id)))warnings.push('Some saved task rules refer to removed quote work. Review before replacing the schedule.');
 return {tasks,warnings:[...new Set(warnings)],lateHours,unassignedHours:sum(seeds.filter(s=>s.stage==='other').map(s=>s.hours))};
}

export function planMetrics(plan:ProductionPlan){
 return plan.baseline.map(task=>{const actual=plan.actuals[task.id];return {task,actual,daysLate:actual?.completed&&task.finish?day(actual.completed)-day(task.finish):null,hoursVariance:actual?.hours!=null?actual.hours-task.hours:null};});
}

/** Bounded operational data; no commercial quote fields are accepted here. */
export function parseProductionPlan(value:unknown):ProductionPlan{
 const fail=():never=>{throw new Error('Invalid production schedule. Check dates, hours and task settings.');};
 const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
 const str=(v:unknown,max=2000)=>typeof v==='string'&&v.length<=max?v:fail();
 const num=(v:unknown,max=1e7)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max?v:fail();
 const date=(v:unknown)=>v===''?'':validDate(v)?v as string:fail();
 const root=obj(value),cal=obj(root.calendar);
 if(!Number.isInteger(root.rampDays))fail();
 if(typeof cal.saturday!=='boolean'||typeof cal.sunday!=='boolean'||!['proposed','approved'].includes(String(root.status))||!Number.isSafeInteger(root.quoteVersion))fail();
 const tasks=(v:unknown):PlanTask[]=>{
  if(!Array.isArray(v)||v.length>3000)fail();
  const result=(v as unknown[]).map(entry=>{const t=obj(entry);if(!FLOW.includes(t.stage as PlanStage)||!Array.isArray(t.daily)||t.daily.length>1100||!Array.isArray(t.predecessors)||t.predecessors.length>3000||typeof t.locked!=='boolean')fail();
   const daily=(t.daily as unknown[]).map(entry=>{const d=obj(entry),when=date(d.date);if(!when)fail();return {date:when,hours:num(d.hours)};});
   const task={id:str(t.id,400),itemId:str(t.itemId,200),item:str(t.item),stage:t.stage as PlanStage,trade:str(t.trade,200),hours:num(t.hours),start:date(t.start),finish:date(t.finish),daily,predecessors:(t.predecessors as unknown[]).map(id=>str(id,400)),locked:t.locked as boolean};
   if(new Set(daily.map(d=>d.date)).size!==daily.length||daily.some(d=>d.date<task.start||d.date>task.finish)||sum(daily.map(d=>d.hours))>task.hours+.00001)fail();return task;});
  if(new Set(result.map(t=>t.id)).size!==result.length)fail();return result;
 };
 const rules=Object.fromEntries(Object.entries(obj(root.rules)).map(([id,v])=>{str(id,400);const r=obj(v),rule:TaskRule={};
  for(const key of ['start','finish'] as const)if(r[key]!==undefined)rule[key]=date(r[key]);
  for(const key of ['dailyHours','lagDays','remainingHours'] as const)if(r[key]!==undefined)rule[key]=num(r[key],key==='lagDays'?365:1e7);
  if(rule.dailyHours===0||rule.lagDays!==undefined&&!Number.isInteger(rule.lagDays))fail();
  if(r.locked!==undefined){if(typeof r.locked!=='boolean')fail();rule.locked=r.locked as boolean;}
  if(rule.locked&&(!rule.start||!rule.finish||rule.finish<rule.start||!productionDays(rule.start,rule.finish,cal as ProductionCalendar).length))fail();
  if(r.predecessors!==undefined){if(!Array.isArray(r.predecessors)||r.predecessors.length>3000)fail();rule.predecessors=(r.predecessors as unknown[]).map(id=>str(id,400));}
  return [id,rule];}));
 const actuals=Object.fromEntries(Object.entries(obj(root.actuals)).map(([id,v])=>{str(id,400);const a=obj(v);return [id,{completed:date(a.completed),hours:a.hours===null?null:num(a.hours),reason:str(a.reason,200),notes:str(a.notes)}];}));
 if(Object.keys(rules).length>3000||Object.keys(actuals).length>3000)fail();
 return {...(root.workback?{workback:parseWorkback(root.workback)}:{}),engine:str(root.engine,100),quoteVersion:num(root.quoteVersion),status:root.status as ProductionPlan['status'],calendar:parseProductionCalendar(cal),rampDays:num(root.rampDays,365),rules,tasks:tasks(root.tasks),baseline:tasks(root.baseline),actuals,notes:str(root.notes,10000)};
}
