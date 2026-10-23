import {validDate} from './quote-schedule';
import {capacityLoad,capacityProject,rosterCapacity,dayNumber,monday,type CapacitySettings} from './capacity';
export const isShopRosterTrade=(name:string)=>!['cad','drawings','design','design / engineering / cad','i&d','driver/pickups','facility'].includes(name.trim().toLowerCase());
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
 const reservedField=ids===null?fieldLoad:capacityLoad(weightedAll,settings,'field',[],false,count,bucketDays);
 const reservedShop=ids===null?load:capacityLoad(weightedAll,settings,'shop',[],true,count,bucketDays);
 const reservedPacking=reservedShop.trades['Crate & pack']??Array<number>(count).fill(0);
 const dedicatedShop=capacity.shop-(capacity.primary['Crate & pack']??0);
 // The shared crew is counted once; its other work reduces each view's available hours.
 const factor=(i:number)=>bucketDays===7?1:([0,6].includes(new Date((dayNumber(settings.weekStart)+i)*86400000).getUTCDay())?0:1/5);
 const tradeAvailable=Object.fromEntries(Object.entries(capacity.primary).map(([trade,hours])=>[trade,Array.from({length:count},(_,i)=>hours*factor(i))]));
 const sharedAvailable=Array.from({length:count},(_,i)=>sharedCapacity*factor(i));
 const shopAvailable=reservedField.expected.map((h,i)=>dedicatedShop*factor(i)+Math.max(0,sharedAvailable[i]-h));
 const fieldAvailable=reservedPacking.map((h,i)=>Math.max(0,sharedAvailable[i]-h));
 return {projects:included,load,fieldLoad,capacity,tradeAvailable,sharedAvailable,sharedCapacity,sharedNeeded,shopAvailable,fieldAvailable,packing,unscheduledField:reservedField.unscheduled,unscheduledShop:reservedShop.unscheduled};
}

/** Weekly charts include the complete weeks containing the chosen dates. */
export function capacityViewRange(start:string,end:string){
 if(!validDate(start)||!validDate(end))return null;
 const weekStart=monday(start),last=monday(end);
 if(!Number.isFinite(dayNumber(weekStart))||!Number.isFinite(dayNumber(last))||end<start)return null;
 const count=Math.floor((dayNumber(last)-dayNumber(weekStart))/7)+1;
 return count>0&&count<=104?{weekStart,count}:null;
}
