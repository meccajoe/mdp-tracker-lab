import {dashboardLoad,type CapacityProject} from './capacity-dashboard';
import {validDate} from './quote-schedule';
import {emptyPlan,proposeProductionPlan} from './production-plan';
import type {CapacitySettings} from './capacity';
export type PlanningDates={buildStart:string;buildFinish:string;installDate:string};
export function planningDateError(dates:PlanningDates){
 if(!validDate(dates.buildStart)||!validDate(dates.buildFinish))return 'Enter a valid Project Start and Project Finish.';
 if(dates.buildFinish<dates.buildStart)return 'Project Finish must be on or after Project Start.';
 if(dates.installDate&&!validDate(dates.installDate))return 'Enter a valid Install Date or leave it blank.';
 return '';
}
function withPlanningDates(project:CapacityProject,dates:PlanningDates|undefined,settings:CapacitySettings):CapacityProject{
 if(!dates||planningDateError(dates)||!project.document)return project;
 const copy=structuredClone(project);
 copy.schedule={...copy.schedule,...dates,projectStartOverride:dates.buildStart};
 copy.activationDate=dates.buildStart;
 copy.document={...copy.document!,schedule:copy.schedule};
 const plan=copy.productionPlan??{...emptyPlan(),calendar:copy.document.productionCalendar??emptyPlan().calendar};
 // Retain trade/hour rules and calendar, but reflow timing in this isolated preview.
 const rules=Object.fromEntries(Object.entries(plan.rules).map(([id,{start,finish,locked,...rule}])=>[id,rule]));
 const options={...plan,rules};
 copy.productionPlan={...options,status:'proposed',quoteVersion:copy.version??0,tasks:proposeProductionPlan(copy.document,settings.roster,options).tasks};
 return copy;
}
export function planningOpenQuotes(projects:CapacityProject[]){return projects.filter(p=>p.document&&p.capacitySelected!==false&&!p.committed&&p.projectStatus!=='Complete'&&!['Closed won','Lost','Completed','In production'].includes(p.forecast));}
/** Read-only what-if projection: selected eligible quotes receive full hours, never mutate sources. */
export function capacityPlanning(projects:CapacityProject[],settings:CapacitySettings,selected:string[],count:number,dates:Record<string,PlanningDates>={}){
 const committed=projects.filter(p=>p.committed&&p.capacitySelected!==false),ids=new Set(selected),added=planningOpenQuotes(projects).filter(p=>ids.has(p.workspaceId)).map(p=>withPlanningDates(p,dates[p.workspaceId],settings));
 const evaluate=(items:CapacityProject[])=>dashboardLoad(items.map(p=>({...p,probability:1})),settings,null,'expected',count);
 const before=evaluate(committed),after=evaluate([...committed,...added]),zero=()=>Array<number>(count).fill(0);
 const row=(key:string,name:string,b:number[],a:number[],bc:number[],ac:number[])=>({key,name,before:b,after:a,beforeCapacity:bc,capacity:ac});
 const trades=[...new Set([...Object.keys(after.tradeAvailable),...Object.keys(after.load.trades)])].filter(t=>!['Crate & pack','I&D','Untyped / other'].includes(t));
 const rows=[row('shop','All Shop Combined',before.load.expected,after.load.expected,before.shopAvailable,after.shopAvailable),...trades.map(t=>row(t,t,before.load.trades[t]??zero(),after.load.trades[t]??zero(),before.tradeAvailable[t]??zero(),after.tradeAvailable[t]??zero())),row('shared','I&D — packing + field work',before.sharedNeeded,after.sharedNeeded,before.sharedAvailable,after.sharedAvailable),row('cad','CAD / Drawings',before.cadNeeded,after.cadNeeded,before.cadAvailable,after.cadAvailable)];
 const warnings=[...new Set([...after.unscheduledShop,...after.unscheduledField,...after.cadUnscheduled].map(name=>`${name}: missing dates or work that could not be placed.`))];
 for(const p of [...committed,...added]){if(!p.document)warnings.push(`${p.workspace}: no saved workbook.`);if(p.untyped>0)warnings.push(`${p.workspace}: ${p.untyped.toFixed(1)} shop hours have no trade; trade-level fit is incomplete.`);}
 return {before,after,rows,committed,added,warnings};
}
