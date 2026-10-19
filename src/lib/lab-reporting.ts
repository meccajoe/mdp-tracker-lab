import {capacityProject,dateString,dayNumber,emptyCapacity,monday,parseCapacity,type CapacityQuote,type CapacityDocument} from './capacity';
import {dashboardLoad,type DemandBasis} from './capacity-dashboard';
import {validDate} from './quote-schedule';
import {sameTeamSources,type TeamResult} from './team-schedule';
import type {WorkbackSnapshot} from './workback-model';
import type {Report} from './lab-reporting-auth';

export type ReportingSnapshot={quotes:CapacityQuote[];settings:CapacityDocument;rosterVersion:number;plans:Record<string,number>;team:{latest:TeamRevision|null;approved:TeamRevision|null}};
export type TeamRevision={revision:number;created_at:string;document:{sources:unknown;result:TeamResult}};
const text=(v:string)=>{if(typeof v!=='string')throw Error('Invalid reporting text.');return v;};
const number=(v:number)=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error('Invalid reporting number.');return v;};
const boolean=(v:boolean)=>{if(typeof v!=='boolean')throw Error('Invalid reporting flag.');return v;};
function milestones(w:WorkbackSnapshot|null|undefined){
 return w?{quoteRevision:w.quoteVersion,due:w.dueDate,install:w.installDate,stages:w.stages.map(s=>({stage:s.id,start:s.start,finish:s.finish,days:s.days})),tasks:w.tasks.map(t=>({id:t.id,item:t.item,stage:t.stage,start:t.start,finish:t.finish,hours:t.hours,dependencies:t.dependencies.map(String),clientDeliverable:t.client})),warningCount:w.warnings.length}:null;
}
export function reportOptions(url:URL){
 const allowed=new Set(['report','start','weeks','basis']);
 for(const key of url.searchParams.keys())if(!allowed.has(key)||url.searchParams.getAll(key).length!==1)throw Error('Invalid query.');
 const report=url.searchParams.get('report')??'projects';
 if(!['projects','roster','capacity','team-schedule'].includes(report))throw Error('Unknown report.');
 const start=url.searchParams.get('start')??monday(new Date().toISOString().slice(0,10));
 const weeks=Number(url.searchParams.get('weeks')??13),basis=url.searchParams.get('basis')??'expected';
 if(!validDate(start)||!Number.isSafeInteger(weeks)||weeks<1||weeks>26||!['expected','committed','full'].includes(basis)||dayNumber(start)+7*weeks>dayNumber('2200-12-31'))throw Error('Choose valid start, weeks (1–26), and basis.');
 return {report:report as Report,start:monday(start),weeks,basis:basis as DemandBasis};
}

/** Build every public object field-by-field. Never serialize source documents or freeform notes. */
export function buildReport(snapshot:ReportingSnapshot,options:ReturnType<typeof reportOptions>){
 const {settings}=snapshot.settings,projects=snapshot.quotes.map(q=>capacityProject(q));
 const sources={roster:snapshot.rosterVersion,quotes:snapshot.quotes.map(q=>({id:q.workspaceId,quote:q.version??0,plan:snapshot.plans[q.workspaceId]??0}))};
 const common={schemaVersion:1,environment:'tracker-lab',generatedAt:new Date().toISOString(),sources};
 if(options.report==='roster')return {...common,configured:snapshot.rosterVersion>0,people:settings.roster.map(p=>({id:p.id,name:p.name,primaryTrade:p.primary,secondaryTrade:p.secondary,weeklyHours:p.hours,active:p.active}))};
 if(options.report==='projects')return {...common,projects:projects.map(p=>({id:p.workspaceId,name:p.workspace,quoteRevision:p.version??0,forecastStatus:p.status,probability:p.probability,committed:p.committed,dates:{buildStart:p.schedule.buildStart,buildFinish:p.schedule.buildFinish,due:p.schedule.dueDate??'',ship:p.schedule.shipDate??'',install:p.schedule.installDate},hours:{shop:p.shop,field:p.field,design:p.demand.design,unassignedShop:p.untyped,byTrade:Object.entries(p.trades).map(([trade,hours])=>({trade,hours}))},schedule:p.productionPlan?{status:p.productionPlan.status,quoteRevision:p.productionPlan.quoteVersion,stale:p.productionPlan.quoteVersion!==p.version,tasks:p.productionPlan.tasks.map(t=>({id:t.id,item:t.item,stage:t.stage,trade:t.trade,hours:t.hours,start:t.start,finish:t.finish,predecessors:t.predecessors.map(id=>String(id)),daily:t.daily.map(d=>({date:d.date,hours:d.hours}))}))}:null,workback:p.productionPlan?.workback?{active:p.productionPlan.workback.active,current:milestones(p.productionPlan.workback.current),proposed:milestones(p.productionPlan.workback.proposed)}:null,flags:p.flags.map(flag=>String(flag))}))};
 if(options.report==='capacity'){
  const load=dashboardLoad(projects,{...settings,weekStart:options.start},null,options.basis,options.weeks);
  return {...common,start:options.start,basis:options.basis,rosterConfigured:snapshot.rosterVersion>0&&settings.roster.some(p=>p.active),weeks:Array.from({length:options.weeks},(_,i)=>({start:dateString(dayNumber(options.start)+i*7),shop:{needed:load.load.expected[i],available:load.shopAvailable[i],shortage:Math.max(0,load.load.expected[i]-load.shopAvailable[i])},field:{needed:load.fieldLoad.expected[i],available:load.fieldAvailable[i],shortage:Math.max(0,load.fieldLoad.expected[i]-load.fieldAvailable[i])},sharedCrew:{needed:load.sharedNeeded[i],available:load.sharedCapacity,shortage:Math.max(0,load.sharedNeeded[i]-load.sharedCapacity)},tradeDemand:Object.entries(load.load.trades).map(([trade,hours])=>({trade,hours:hours[i]}))})),unscheduledShop:load.unscheduledShop.map(String),unscheduledField:load.unscheduledField.map(String)};
 }
 const team=(row:TeamRevision|null)=>{
  if(!row)return null;
  const result=row.document.result;
  return {revision:number(row.revision),createdAt:text(row.created_at),stale:!sameTeamSources(row.document.sources,sources),start:text(result.options.start),finish:text(result.options.finish),totalHours:number(result.totalHours),assignedHours:number(result.assignedHours),allocations:result.allocations.map(a=>({projectId:text(a.workspaceId),project:text(a.project),item:text(a.item),trade:text(a.trade),personId:text(a.personId),person:text(a.person),date:text(a.date),hours:number(a.hours),secondarySkill:boolean(a.secondary)})),unfilled:result.unfilled.map(t=>({taskId:text(t.taskKey),project:text(t.project),item:text(t.item),trade:text(t.trade),hours:number(t.hours)})),availability:result.options.availability.map(a=>({personId:text(a.personId),date:text(a.date),hours:number(a.hours)})),warningCount:result.warnings.length};
 };
 return {...common,latest:team(snapshot.team.latest),approved:team(snapshot.team.approved)};
}

export function reportingSettings(value:unknown){return value?parseCapacity(value):emptyCapacity();}
