import {productionDays,type ProductionCalendar} from './production-calendar';
const iso=(day:number)=>new Date(day*86400000).toISOString().slice(0,10);
export type PreparationPhase={kind:'CAD'|'Turnover';start:string;finish:string;workdays:number;hours:number|null;daily:{date:string;fraction:number;hours:number|null}[];staffingNote:string};
/** Exact working-time windows, including partial boundary days. Labor is never invented. */
export function projectPreparation(start:string,finish:string,cadHours:number,calendar:ProductionCalendar):PreparationPhase[]{
 const days=productionDays(start,finish,calendar);
 if(!days.length)return [];
 return ([['CAD',0,.15,cadHours],['Turnover',.15,.20,null]] as const).map(([kind,from,to,hours])=>{
  const lower=days.length*from,upper=days.length*to,workdays=upper-lower;
  const daily=days.flatMap((day,i)=>{const fraction=Math.max(0,Math.min(i+1,upper)-Math.max(i,lower));return fraction>1e-9?[{date:iso(day),fraction,hours:hours===null?null:hours*fraction/workdays}]:[];});
  const equivalent=hours===null?0:hours/workdays;
  const staffingNote=kind==='Turnover'?'Purchasing / project turnover window. Labor hours are not estimated.':equivalent>8?`${equivalent.toFixed(1)} crew-hours per full CAD day: plan ${Math.ceil(equivalent/8)} CAD people or equivalent overtime. Staffing assumed; names not assigned.`:'CAD staffing assumed; names not assigned.';
  return {kind,start:daily[0].date,finish:daily.at(-1)!.date,workdays,hours,daily,staffingNote};
 });
}
