import {projectPreparation} from './project-preparation';
import {emptyPlan} from './production-plan';
import {validDate} from './quote-schedule';
import {capacityLoad,capacityProject,rosterCapacity,dayNumber,monday,type CapacitySettings} from './capacity';
export const isCadTrade=(name:string)=>['cad','drawings','design','design / engineering / cad','cad / drawings'].includes(name.trim().toLowerCase());
export const isShopRosterTrade=(name:string)=>!isCadTrade(name)&&!['i&d','driver/pickups','facility'].includes(name.trim().toLowerCase());
export type DemandBasis='expected'|'committed'|'full';
export type CapacityProject=ReturnType<typeof capacityProject>;
/** Project filters affect demand only. Each active roster member remains counted once. */
export function dashboardLoad(projects:CapacityProject[],settings:CapacitySettings,selected:string[]|null,basis:DemandBasis,count=26,bucketDays:1|7=7){
 const ids=selected===null?null:new Set(selected);
 const included=projects.filter(project=>ids===null||ids.has(project.workspaceId));
 const weightedAll=projects.map(project=>({...project,probability:basis==='committed'?(project.committed?1:0):basis==='full'?(project.probability>0?1:0):project.probability}));
 const weighted=weightedAll.filter(project=>ids===null||ids.has(project.workspaceId));
 const load=capacityLoad(weighted,settings,'shop',[],true,count,bucketDays),fieldLoad=capacityLoad(weighted,settings,'field',[],false,count,bucketDays);
 const capacity=rosterCapacity(settings.roster.filter(person=>isShopRosterTrade(person.primary)));
 const allCapacity=rosterCapacity(settings.roster),packing=load.trades['Crate & pack']??Array<number>(count).fill(0);
 const sharedCapacity=(allCapacity.primary['I&D']??0)+(allCapacity.primary['Crate & pack']??0);
 const sharedNeeded=fieldLoad.expected.map((h,i)=>h+packing[i]);
 // Compute reservations by date even in weekly view, then sum: toggling views cannot create capacity.
 const dailyCount=count*bucketDays;
 const reservedField=capacityLoad(weightedAll,settings,'field',[],false,dailyCount,1);
 const reservedShop=capacityLoad(weightedAll,settings,'shop',[],true,dailyCount,1);
 const reservedPacking=reservedShop.trades['Crate & pack']??Array<number>(dailyCount).fill(0);
 const dedicatedShop=capacity.shop-(capacity.primary['Crate & pack']??0);
 const factor=(i:number)=>[0,6].includes(new Date((dayNumber(settings.weekStart)+i)*86400000).getUTCDay())?0:1/5;
 const aggregate=(values:number[])=>Array.from({length:count},(_,i)=>values.slice(i*bucketDays,(i+1)*bucketDays).reduce((sum,h)=>sum+h,0));
 const tradeAvailable=Object.fromEntries(Object.entries(capacity.primary).map(([trade,hours])=>[trade,aggregate(Array.from({length:dailyCount},(_,i)=>hours*factor(i)))]));
 const sharedDaily=Array.from({length:dailyCount},(_,i)=>sharedCapacity*factor(i));
 const sharedAvailable=aggregate(sharedDaily);
 const packingAvailable=aggregate(reservedField.expected.map((h,i)=>Math.max(0,sharedDaily[i]-h)));
 const shopAvailable=aggregate(reservedField.expected.map((h,i)=>dedicatedShop*factor(i)+Math.max(0,sharedDaily[i]-h)));
 const fieldAvailable=aggregate(reservedPacking.map((h,i)=>Math.max(0,sharedDaily[i]-h)));
 const cadContributions:{id:string;name:string;hours:number[]}[]=[];
 const cadNeeded=Array<number>(count).fill(0),cadUnscheduled:string[]=[];
 for(const project of weighted){
  if(!project.probability||!project.document||!project.demand.design)continue;
  const cad=projectPreparation(project.schedule.buildStart,project.schedule.buildFinish,project.demand.design,project.productionPlan?.calendar??project.document.productionCalendar??emptyPlan().calendar,project.activationDate).find(p=>p.kind==='CAD');
  if(!cad)cadUnscheduled.push(project.workspace);
  const hours=Array<number>(count).fill(0);
  for(const d of cad?.daily??[]){const i=Math.floor((dayNumber(d.date)-dayNumber(settings.weekStart))/bucketDays);if(i>=0&&i<count){hours[i]+=(d.hours??0)*project.probability;cadNeeded[i]+=(d.hours??0)*project.probability;}}
  cadContributions.push({id:project.workspaceId,name:project.workspace,hours});
 }
 const cadWeekly=settings.cadHoursPerWeek??settings.roster.filter(p=>p.active&&isCadTrade(p.primary)).reduce((s,p)=>s+p.hours,0);
 const cadAvailable=aggregate(Array.from({length:dailyCount},(_,i)=>cadWeekly*factor(i)));
 return {cadContributions,cadNeeded,cadAvailable,cadUnscheduled,projects:included,load,fieldLoad,capacity,tradeAvailable,packingAvailable,sharedAvailable,sharedCapacity,sharedNeeded,shopAvailable,fieldAvailable,packing,unscheduledField:reservedField.unscheduled,unscheduledShop:reservedShop.unscheduled};
}

/** Weekly charts include the complete weeks containing the chosen dates. */
export function capacityViewRange(start:string,end:string){
 if(!validDate(start)||!validDate(end))return null;
 const weekStart=monday(start),last=monday(end);
 if(!Number.isFinite(dayNumber(weekStart))||!Number.isFinite(dayNumber(last))||end<start)return null;
 const count=Math.floor((dayNumber(last)-dayNumber(weekStart))/7)+1;
 return count>0&&count<=104?{weekStart,count}:null;
}
