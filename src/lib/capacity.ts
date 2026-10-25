import {effectiveProjectSchedule} from './quote-schedule';
import {projectPreparation} from './project-preparation';
import {capacityTrade,remainingTradeHours} from './capacity-trades';
import {parseWorkbackPolicy,type WorkbackPolicy} from './workback-model';
import {proposeProductionPlan,emptyPlan,type ProductionPlan} from './production-plan';
import {isProductionDay,productionDays,WEEKDAYS,type ProductionCalendar} from './production-calendar';
import {calculateQuoteV27,type QuoteV27} from './quote-v27';
import {projectStatusFor,salesForecast,EMPTY_SCHEDULE,FORECAST_STATUSES,validDate,type ForecastStatus} from './quote-schedule';
export const SHOP_TRADES=['Carpentry','CNC + cutting','Finish / Paint','Graphic / Vinyl Install','Electrical','Metal Work','Crate & pack','Sculpting'];
export const SUPPORT_TRADES=['I&D','Driver/Pickups','Facility'];
export type RosterPerson={id:string;name:string;primary:string;secondary:string;hours:number;rate:number|null;active:boolean;notes:string};
export type CapacitySettings={cadHoursPerWeek?:number|null;workback?:WorkbackPolicy;weekStart:string;allocation:'weekdays'|'calendar';fieldAllocation:'install'|'build';roster:RosterPerson[]};
export type CapacityOverride={status:ForecastStatus|'';remainingShop:number|null;remainingField:number|null;remainingTrades:Record<string,number>;notes:string};
export type CapacityDocument={settings:CapacitySettings};
export const emptyOverride=():CapacityOverride=>({status:'',remainingShop:null,remainingField:null,remainingTrades:{},notes:''});
export const dayNumber=(date:string)=>Date.parse(`${date}T00:00:00Z`)/86400000;
export const dateString=(day:number)=>new Date(day*86400000).toISOString().slice(0,10);
export function monday(date:string){const day=dayNumber(date);return dateString(day-((new Date(day*86400000).getUTCDay()+6)%7));}
export function emptyCapacity():CapacityDocument{return {settings:{weekStart:monday(new Date().toISOString().slice(0,10)),allocation:'weekdays',fieldAllocation:'install',roster:[]}};}
export function parseCapacity(value:unknown):CapacityDocument {
 const fail=()=>{throw new Error('Invalid capacity settings.');};
 const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
 const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e9?v:fail();
 const text=(v:unknown,max=2000)=>typeof v==='string'&&v.length<=max?v:fail();
 const root=object(value),s=object(root.settings);
 if(!validDate(s.weekStart)||monday(s.weekStart)!==s.weekStart||!['weekdays','calendar'].includes(String(s.allocation))||!['install','build'].includes(String(s.fieldAllocation))||!Array.isArray(s.roster)||s.roster.length>300)fail();
 const roster=(s.roster as unknown[]).map(v=>{const r=object(v);if(typeof r.active!=='boolean')fail();return {id:text(r.id,200),name:text(r.name),primary:text(r.primary,200),secondary:text(r.secondary,200),hours:num(r.hours),rate:r.rate===null?null:num(r.rate),active:r.active as boolean,notes:text(r.notes)};});
 if(roster.some(r=>!r.id||!r.name.trim()||!r.primary.trim()||r.hours>168)||new Set(roster.map(r=>r.id)).size!==roster.length)fail();
 return {settings:{...(s.cadHoursPerWeek!==undefined?{cadHoursPerWeek:s.cadHoursPerWeek===null?null:num(s.cadHoursPerWeek)}:{}),...(s.workback?{workback:parseWorkbackPolicy(s.workback)}:{}),weekStart:s.weekStart as string,allocation:s.allocation as CapacitySettings['allocation'],fieldAllocation:s.fieldAllocation as CapacitySettings['fieldAllocation'],roster}};
}
export function parsePlanning(value:unknown):CapacityOverride {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid capacity plan.');
 const row=value as CapacityOverride;
 if(row.status!==''&&!FORECAST_STATUSES.includes(row.status))throw new Error('Invalid planning status.');
 const number=(n:unknown)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1e9)throw new Error('Invalid remaining hours.');return n;};
 if(!row.remainingTrades||typeof row.remainingTrades!=='object'||Array.isArray(row.remainingTrades)||Object.keys(row.remainingTrades).length>100||typeof row.notes!=='string'||row.notes.length>2000)throw new Error('Invalid planning details.');
 return {status:row.status,remainingShop:row.remainingShop===null?null:number(row.remainingShop),remainingField:row.remainingField===null?null:number(row.remainingField),remainingTrades:Object.fromEntries(Object.entries(row.remainingTrades).map(([key,value])=>{if(!key||key.length>200)throw new Error('Invalid trade name.');return [key,number(value)];})),notes:row.notes};
}

export function probability(status:string){return ({'Not likely':.25,Possible:.5,Likely:.75,'Highly likely':.9,'Closed won':1,'In production':1,Lost:0,Completed:0} as Record<string,number>)[status]??0;}
export function isCommitted(status:string){return status==='Closed won'||status==='In production';}
export function quoteDemand(quote:QuoteV27){
 const calculation=calculateQuoteV27(quote),shopTypes=['Fabrication','Graphics','beMatrix / SEG','Stage / Pack / Prep','Disposal','Props / Resale'];
 const shopLines=calculation.lines.filter(line=>shopTypes.includes(line.type)),shopIds=new Set(shopLines.map(line=>line.id));
 const shop=shopLines.reduce((sum,line)=>sum+line.hoursAllowed,0),trades:Record<string,number>={};
 for(const row of calculation.takeoffs){if(!shopIds.has(row.lineId)||!row.extendedHours)continue;
  // Exact, unique trade names can identify labor selected before explicit trade attribution existed.
  const matches=row.tradeId?quote.trades.filter(trade=>trade.id===row.tradeId):quote.trades.filter(trade=>trade.name.toLowerCase()===row.description.toLowerCase());
  if(matches.length===1)trades[matches[0].name]=(trades[matches[0].name]??0)+row.extendedHours;
 }
 const typed=Object.values(trades).reduce((a,b)=>a+b,0);
 const field=calculation.lines.filter(line=>line.type==='Installer Days').reduce((sum,line)=>sum+line.hoursAllowed,0);
 // Imported v27 Installer Days rows retain each person's duration. Do not turn
 // concurrent person-days into one long single-person installation window.
 const importedDays=quote.assumptionsVersion.startsWith('xlsx-v27-')?calculation.lines.filter(line=>line.type==='Installer Days').map(line=>line.inputs.siteDays):[];
 const fieldDays=Math.max(0,...(calculation.estimators?.install.map(person=>person.days)??importedDays));
 return {shop,trades,untyped:Math.max(0,shop-typed),overallocated:Math.max(0,typed-shop),field,fieldDays:fieldDays||Math.ceil(field/Math.max(1,quote.settings.siteHours)),design:calculation.lines.filter(line=>line.type==='Design / Engineering / CAD').reduce((sum,line)=>sum+line.hoursAllowed,0),price:calculation.totals.price};
}
export type CapacityQuote={activationDate?:string;workspaceId:string;workspace:string;document:QuoteV27|null;version?:number;productionPlan?:ProductionPlan};
export function capacityProject(source:CapacityQuote,override:CapacityOverride=source.document?.planning??emptyOverride()){
 const demand=source.document?quoteDemand(source.document):{shop:0,trades:{},untyped:0,overallocated:0,field:0,fieldDays:0,design:0,price:0};
 const savedSchedule=source.document?.schedule??EMPTY_SCHEDULE;
 const schedule=effectiveProjectSchedule(savedSchedule,source.activationDate),forecast=salesForecast(override.status||schedule.status),projectStatus=projectStatusFor(schedule,override.status),status=projectStatus==='Complete'?'Completed':projectStatus==='Active'?'In production':forecast;
 const trades=remainingTradeHours(demand.trades,override.remainingTrades);
 const shop=override.remainingShop??demand.shop,field=override.remainingField??demand.field;
 const flags:string[]=[];
 const turnover=projectPreparation(schedule.buildStart,schedule.buildFinish,demand.design,source.productionPlan?.calendar??source.document?.productionCalendar??WEEKDAYS).find(p=>p.kind==='Turnover');
 if(projectStatus==='Active'&&turnover)flags.push(`Readiness review: confirm CAD, purchasing and scope review by planned turnover finish ${turnover.finish}`);
 if(turnover&&source.productionPlan?.tasks.some(t=>t.stage!=='cad'&&t.daily.some(d=>d.date<=turnover.finish)))flags.push('Saved production dates overlap project turnover — review plan; live assignments wait for turnover');
 if(source.productionPlan&&source.version!==undefined&&source.productionPlan.quoteVersion!==source.version)flags.push('Saved schedule uses an earlier quote revision — review recalculation');
 if(source.productionPlan?.tasks.some(t=>t.daily.some(d=>d.date>schedule.buildFinish)))flags.push('Scheduled work exceeds the quoted finish — review staffing shortage');
 if(!source.document)flags.push('No saved quote yet');
 if(!schedule.buildStart||!schedule.buildFinish)flags.push('Unscheduled shop demand — set build dates');
 if(!status)flags.push('Choose forecast status');
 if(override.status)flags.push(`Override: ${override.status} (quote: ${schedule.status||'unset'})`);
 if(Object.values(trades).reduce((sum,n)=>sum+n,0)>shop+.000001)flags.push('Trade hours exceed total shop hours — reconcile allocations');
 return {...source,schedule,status,probability:probability(status),committed:projectStatus==='Active',projectStatus,forecast,demand,shop,field,trades,untyped:Math.max(0,shop-Object.values(trades).reduce((sum,n)=>sum+n,0)),flags};
}
/** Exact day-overlap allocation, preserving demand across partial weeks and DST changes. */
export function allocateHours(hours:number,start:string,finish:string,weekStart:string,count=26,mode:'weekdays'|'calendar'|ProductionCalendar='weekdays',bucketDays:1|7=7){
 const buckets=Array<number>(count).fill(0);
 if(!validDate(start)||!validDate(finish)||finish<start||!validDate(weekStart))return buckets;
 const first=dayNumber(start),last=dayNumber(finish),grid=dayNumber(weekStart);
 let divisor=0;const days:number[]=[];
 for(let day=first;day<=last;day++){if(mode!=='calendar'&&!isProductionDay(day,mode==='weekdays'?WEEKDAYS:mode))continue;divisor++;days.push(day);}
 if(!divisor)return buckets;
 for(const day of days){const index=Math.floor((day-grid)/bucketDays);if(index>=0&&index<count)buckets[index]+=hours/divisor;}
 return buckets;
}
export function rosterCapacity(roster:RosterPerson[]){
 const primary:Record<string,number>={},flex:Record<string,number>={};let shop=0,field=0;
 for(const person of roster.filter(p=>p.active)){const trade=capacityTrade(person.primary),secondary=capacityTrade(person.secondary);primary[trade]=(primary[trade]??0)+person.hours;if(secondary&&secondary!==trade)flex[secondary]=(flex[secondary]??0)+person.hours;if(!SUPPORT_TRADES.includes(person.primary))shop+=person.hours;if(person.primary==='I&D')field+=person.hours;}
 return {primary,flex,shop,field};
}
export function capacityLoad(projects:ReturnType<typeof capacityProject>[],settings:CapacitySettings,kind:'shop'|'field',scenarioIds:string[]=[],dynamicSchedule=false,count=26,bucketDays:1|7=7){
 const committed=Array<number>(count).fill(0),pipeline=Array<number>(count).fill(0),scenario=Array<number>(count).fill(0),trades:Record<string,number[]>={};
 const contributions:{id:string;name:string;hours:number[];trades:Record<string,number[]>}[]=[];
 const unscheduled:string[]=[];
 for(const project of projects){
  if(!project.probability)continue;
  let start=project.schedule.buildStart,finish=project.schedule.buildFinish,mode:'calendar'|ProductionCalendar=project.document?.productionCalendar??WEEKDAYS;
  if(kind==='field'&&settings.fieldAllocation==='install'){start=project.schedule.installDate;finish=start&&validDate(start)?dateString(dayNumber(start)+Math.max(1,Math.ceil(project.demand.fieldDays))-1):'';mode='calendar';}
  const total=kind==='shop'?project.shop:project.field;
  if(!start||!finish||finish<start||(mode!=='calendar'&&!productionDays(start,finish,mode).length)){if(total>0)unscheduled.push(project.workspace);continue;}
  let parts=allocateHours(total,start,finish,settings.weekStart,count,mode,bucketDays);
  let scheduledTrades:Record<string,number[]>|null=null;
  if(kind==='shop'&&dynamicSchedule&&project.document){
   const proposal=(project.productionPlan&&(!project.schedule.projectStartOverride||project.version===undefined||project.productionPlan.quoteVersion===project.version)?project.productionPlan.tasks:proposeProductionPlan({...project.document,schedule:project.schedule},settings.roster,project.productionPlan??{...emptyPlan(),calendar:project.document.productionCalendar??WEEKDAYS}).tasks);
   const shopTasks=proposal.filter(t=>t.stage!=='cad');
   if(shopTasks.some(t=>t.daily.reduce((n,d)=>n+d.hours,0)<t.hours-.000001))unscheduled.push(project.workspace);
   const bucket=(entries:{date:string;hours:number}[])=>{const values=Array<number>(count).fill(0);for(const e of entries){const i=Math.floor((dayNumber(e.date)-dayNumber(settings.weekStart))/bucketDays);if(i>=0&&i<count)values[i]+=e.hours;}return values;};
   if(shopTasks.length&&(project.productionPlan||project.demand.overallocated<.000001)){
    scheduledTrades={};
    for(const task of shopTasks){const name=task.trade==='Unassigned shop hours'?'Untyped / other':task.trade;const values=bucket(task.daily);const existing=scheduledTrades[name]??Array<number>(count).fill(0);scheduledTrades[name]=existing.map((n,i)=>n+values[i]);}
    // Explicit project remaining-trade overrides take precedence over task estimates.
    for(const [trade,hours] of Object.entries(project.document.planning?.remainingTrades??{}).sort(([a],[b])=>Number(['Finish / Paint','Graphic / Vinyl Install','Carpentry'].includes(a))-Number(['Finish / Paint','Graphic / Vinyl Install','Carpentry'].includes(b)))){const pool=capacityTrade(trade),combined=['Finish / Paint','Graphic / Vinyl Install','Carpentry'].includes(trade);if(trade!==pool&&project.document.planning?.remainingTrades[pool]!==undefined)continue;const names=Object.keys(scheduledTrades).filter(name=>combined?capacityTrade(name)===trade:name===trade),values=Array.from({length:count},(_,i)=>names.reduce((n,name)=>n+scheduledTrades![name][i],0)),base=shopTasks.filter(t=>combined?capacityTrade(t.trade)===trade:t.trade===trade).reduce((n,t)=>n+t.hours,0);for(const name of names)delete scheduledTrades[name];scheduledTrades[trade]=base?values.map(n=>n*hours/base):allocateHours(hours,start,finish,settings.weekStart,count,mode,bucketDays);}
    parts=Array.from({length:count},(_,i)=>Object.values(scheduledTrades!).reduce((n,v)=>n+v[i],0));
    const taskHours:Record<string,number>={};for(const task of shopTasks)taskHours[task.trade]=(taskHours[task.trade]??0)+task.hours;
    const taskTotal=Object.values(remainingTradeHours(taskHours,project.document.planning?.remainingTrades??{})).reduce((n,h)=>n+h,0),remaining=project.document.planning?.remainingShop;
    if(remaining!=null&&taskTotal>0)parts=parts.map(n=>n*remaining/taskTotal);
   }
  }
  const projectTrades:Record<string,number[]>={};
  const addTrade=(trade:string,values:number[])=>{const key=capacityTrade(trade);projectTrades[key]=(projectTrades[key]??Array(count).fill(0)).map((n,i)=>n+values[i]*project.probability);};
  if(scheduledTrades)for(const [trade,values] of Object.entries(scheduledTrades))addTrade(trade,values);
  else if(kind==='shop')for(const [trade,hours] of Object.entries({...project.trades,'Untyped / other':project.untyped}))addTrade(trade,allocateHours(hours,start,finish,settings.weekStart,count,mode,bucketDays));
  contributions.push({id:project.workspaceId,name:project.workspace,hours:parts.map(n=>n*project.probability),trades:projectTrades});
  const scenarioWeight=project.committed?1:scenarioIds.includes(project.workspaceId)?1:project.probability;
  parts.forEach((hours,i)=>{(project.committed?committed:pipeline)[i]+=hours*project.probability;scenario[i]+=hours*scenarioWeight;});
  if(scheduledTrades){for(const [trade,values] of Object.entries(scheduledTrades)){const bucket=trades[trade]??Array<number>(count).fill(0);values.forEach((hours,i)=>bucket[i]+=hours*project.probability);trades[trade]=bucket;}}
  else if(kind==='shop')for(const [trade,hours] of Object.entries({...project.trades,'Untyped / other':project.untyped})){const values=allocateHours(hours,start,finish,settings.weekStart,count,mode,bucketDays);const bucket=trades[trade]??Array<number>(count).fill(0);values.forEach((hours,i)=>bucket[i]+=hours*project.probability);trades[trade]=bucket;}
 }
 const grouped:Record<string,number[]>={};for(const [trade,values] of Object.entries(trades)){const key=capacityTrade(trade);grouped[key]=(grouped[key]??Array(count).fill(0)).map((n,i)=>n+values[i]);}
 return {contributions,committed,pipeline,expected:committed.map((hours,i)=>hours+pipeline[i]),scenario,trades:grouped,unscheduled};
}
