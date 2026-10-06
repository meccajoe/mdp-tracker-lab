import {calculateQuoteV27,type QuoteV27} from './quote-v27';
import {EMPTY_SCHEDULE,FORECAST_STATUSES,validDate,type ForecastStatus} from './quote-schedule';
export const SHOP_TRADES=['Carpentry','CNC + cutting','Assembly','Painting','Finish','Graphic Install','Vinyl Install','Electrical','Metal Work','Crate & pack','Sculpting'];
export const SUPPORT_TRADES=['I&D','Driver/Pickups','Facility'];
export type RosterPerson={id:string;name:string;primary:string;secondary:string;hours:number;rate:number|null;active:boolean;notes:string};
export type CapacitySettings={weekStart:string;allocation:'weekdays'|'calendar';fieldAllocation:'install'|'build';roster:RosterPerson[]};
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
 return {settings:{weekStart:s.weekStart as string,allocation:s.allocation as CapacitySettings['allocation'],fieldAllocation:s.fieldAllocation as CapacitySettings['fieldAllocation'],roster}};
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
 const fieldDays=Math.max(0,...(calculation.estimators?.install.map(person=>person.days)??[]));
 return {shop,trades,untyped:Math.max(0,shop-typed),overallocated:Math.max(0,typed-shop),field,fieldDays:fieldDays||Math.ceil(field/Math.max(1,quote.settings.siteHours)),design:calculation.lines.filter(line=>line.type==='Design / Engineering / CAD').reduce((sum,line)=>sum+line.hoursAllowed,0),price:calculation.totals.price};
}
export type CapacityQuote={workspaceId:string;workspace:string;document:QuoteV27|null};
export function capacityProject(source:CapacityQuote,override:CapacityOverride=source.document?.planning??emptyOverride()){
 const demand=source.document?quoteDemand(source.document):{shop:0,trades:{},untyped:0,overallocated:0,field:0,fieldDays:0,design:0,price:0};
 const schedule=source.document?.schedule??EMPTY_SCHEDULE,status=override.status||schedule.status;
 const trades={...demand.trades,...override.remainingTrades};
 const shop=override.remainingShop??demand.shop,field=override.remainingField??demand.field;
 const flags:string[]=[];
 if(!source.document)flags.push('No saved quote yet');
 if(!schedule.buildStart||!schedule.buildFinish)flags.push('Unscheduled shop demand — set build dates');
 if(!status)flags.push('Choose forecast status');
 if(override.status)flags.push(`Override: ${override.status} (quote: ${schedule.status||'unset'})`);
 if(Object.values(trades).reduce((sum,n)=>sum+n,0)>shop+.000001)flags.push('Trade hours exceed total shop hours — reconcile allocations');
 return {...source,schedule,status,probability:probability(status),committed:isCommitted(status),demand,shop,field,trades,untyped:Math.max(0,shop-Object.values(trades).reduce((sum,n)=>sum+n,0)),flags};
}
/** Exact day-overlap allocation, preserving demand across partial weeks and DST changes. */
export function allocateHours(hours:number,start:string,finish:string,weekStart:string,count=26,mode:'weekdays'|'calendar'='weekdays'){
 const buckets=Array<number>(count).fill(0);
 if(!validDate(start)||!validDate(finish)||finish<start||!validDate(weekStart))return buckets;
 const first=dayNumber(start),last=dayNumber(finish),grid=dayNumber(weekStart);
 let divisor=0;const days:number[]=[];
 for(let day=first;day<=last;day++){const weekday=new Date(day*86400000).getUTCDay();if(mode==='weekdays'&&(weekday===0||weekday===6))continue;divisor++;days.push(day);}
 if(!divisor)return buckets;
 for(const day of days){const index=Math.floor((day-grid)/7);if(index>=0&&index<count)buckets[index]+=hours/divisor;}
 return buckets;
}
export function rosterCapacity(roster:RosterPerson[]){
 const primary:Record<string,number>={},flex:Record<string,number>={};let shop=0,field=0;
 for(const person of roster.filter(p=>p.active)){primary[person.primary]=(primary[person.primary]??0)+person.hours;if(person.secondary&&person.secondary!==person.primary)flex[person.secondary]=(flex[person.secondary]??0)+person.hours;if(!SUPPORT_TRADES.includes(person.primary))shop+=person.hours;if(person.primary==='I&D')field+=person.hours;}
 return {primary,flex,shop,field};
}
export function capacityLoad(projects:ReturnType<typeof capacityProject>[],settings:CapacitySettings,kind:'shop'|'field',scenarioIds:string[]=[]){
 const committed=Array<number>(26).fill(0),pipeline=Array<number>(26).fill(0),scenario=Array<number>(26).fill(0),trades:Record<string,number[]>={};
 const unscheduled:string[]=[];
 for(const project of projects){
  if(!project.probability)continue;
  let start=project.schedule.buildStart,finish=project.schedule.buildFinish,mode=settings.allocation;
  if(kind==='field'&&settings.fieldAllocation==='install'){start=project.schedule.installDate;finish=start&&validDate(start)?dateString(dayNumber(start)+Math.max(1,Math.ceil(project.demand.fieldDays))-1):'';mode='calendar';}
  const total=kind==='shop'?project.shop:project.field;
  if(!start||!finish||finish<start||(mode==='weekdays'&&Array.from({length:Math.max(0,dayNumber(finish)-dayNumber(start)+1)},(_,i)=>new Date((dayNumber(start)+i)*86400000).getUTCDay()).every(day=>day===0||day===6))){if(total>0)unscheduled.push(project.workspace);continue;}
  const parts=allocateHours(total,start,finish,settings.weekStart,26,mode),scenarioWeight=project.committed?1:scenarioIds.includes(project.workspaceId)?1:project.probability;
  parts.forEach((hours,i)=>{(project.committed?committed:pipeline)[i]+=hours*project.probability;scenario[i]+=hours*scenarioWeight;});
  if(kind==='shop')for(const [trade,hours] of Object.entries({...project.trades,'Untyped / other':project.untyped})){const values=allocateHours(hours,start,finish,settings.weekStart,26,mode);const bucket=trades[trade]??Array<number>(26).fill(0);values.forEach((hours,i)=>bucket[i]+=hours*project.probability);trades[trade]=bucket;}
 }
 return {committed,pipeline,expected:committed.map((hours,i)=>hours+pipeline[i]),scenario,trades,unscheduled};
}
