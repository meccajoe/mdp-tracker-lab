import {validDate} from './quote-schedule';
import {planningDateError,type PlanningDates} from './capacity-planning';
export type PlanningScenario={name:string;start:string;count:number;selected:string[];dates:Record<string,PlanningDates>};
export type SavedPlanningScenario={id:string;version:number;updated_at:string;document:PlanningScenario};
export function parsePlanningScenario(value:unknown):PlanningScenario{
 const v=value as PlanningScenario;
 if(!v||typeof v!=='object'||typeof v.name!=='string'||!v.name.trim()||v.name.trim().length>100)throw new Error('Enter a scenario name (up to 100 characters).');
 if(!validDate(v.start)||![4,8,13,26].includes(v.count))throw new Error('Choose a valid viewing range.');
 if(!Array.isArray(v.selected)||v.selected.length>1000||v.selected.some(id=>typeof id!=='string'||!UUID.test(id)))throw new Error('Invalid quote selections.');
 if(!v.dates||typeof v.dates!=='object'||Array.isArray(v.dates)||Object.keys(v.dates).length>1000)throw new Error('Invalid temporary dates.');
 const selected=[...new Set(v.selected)],dates:Record<string,PlanningDates>={};
 for(const [id,d] of Object.entries(v.dates)){
  if(!selected.includes(id))throw new Error('Temporary dates must belong to a selected quote.');
  if(!d||typeof d.buildStart!=='string'||typeof d.buildFinish!=='string'||typeof d.installDate!=='string'||planningDateError(d))throw new Error('Fix temporary dates before saving.');
  dates[id]={buildStart:d.buildStart,buildFinish:d.buildFinish,installDate:d.installDate};
 }
 return {name:v.name.trim(),start:v.start,count:v.count,selected,dates};
}
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
