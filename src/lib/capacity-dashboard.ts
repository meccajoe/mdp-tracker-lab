import {capacityLoad,capacityProject,rosterCapacity,type CapacitySettings} from './capacity';
export const isShopRosterTrade=(name:string)=>!['cad','drawings','design','design / engineering / cad','i&d','driver/pickups','facility'].includes(name.trim().toLowerCase());
export type DemandBasis='expected'|'committed'|'full';
export type CapacityProject=ReturnType<typeof capacityProject>;
/** Project filters affect demand only. Each active roster member remains counted once. */
export function dashboardLoad(projects:CapacityProject[],settings:CapacitySettings,selected:string[]|null,basis:DemandBasis){
 const ids=selected===null?null:new Set(selected);
 const included=projects.filter(project=>ids===null||ids.has(project.workspaceId));
 const weighted=included.map(project=>({...project,probability:basis==='committed'?(project.committed?1:0):basis==='full'?(project.probability>0?1:0):project.probability}));
 return {projects:included,load:capacityLoad(weighted,settings,'shop',[],true),capacity:rosterCapacity(settings.roster.filter(person=>isShopRosterTrade(person.primary)))};
}
