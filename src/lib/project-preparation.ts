import {validDate} from './quote-schedule';
import {productionDays,type ProductionCalendar} from './production-calendar';
const iso=(day:number)=>new Date(day*86400000).toISOString().slice(0,10);
export type PreparationPhase={kind:'CAD'|'Turnover';start:string;finish:string;workdays:number;hours:number|null;daily:{date:string;fraction:number;hours:number|null}[];staffingNote:string};
/** Exact working-time windows, including partial boundary days. Labor is never invented. */
export function projectPreparation(start:string,finish:string,cadHours:number,calendar:ProductionCalendar,activationDate?:string):PreparationPhase[]{
 const day0=activationDate&&validDate(activationDate)?activationDate:null;
 const origin=validDate(day0??start)?iso(Date.parse((day0??start)+'T00:00:00Z')/86400000+1):start;
 const days=productionDays(origin,finish,calendar);
 if(!days.length)return [];
 const cadDays=Math.min(Math.max(0,cadHours)/8,days.length*.15),turnoverDays=days.length*.05;
 return ([['CAD',0,cadDays,cadHours],['Turnover',cadDays,cadDays+turnoverDays,null]] as const).filter(([,from,to])=>to>from).map(([kind,from,to,hours])=>{
  const lower=from,upper=to,workdays=upper-lower;
  const daily=days.flatMap((day,i)=>{const fraction=Math.max(0,Math.min(i+1,upper)-Math.max(i,lower));return fraction>1e-9?[{date:iso(day),fraction,hours:hours===null?null:hours*fraction/workdays}]:[];});
  const equivalent=hours===null?0:hours/workdays;
  const staffingNote=kind==='Turnover'?'Purchasing / project turnover window. Labor hours are not estimated.':equivalent>8?`${equivalent.toFixed(1)} crew-hours per full CAD day: plan ${Math.ceil(equivalent/8)} CAD people or equivalent overtime. Staffing assumed; names not assigned.`:'One CAD person at 8 hours per day; name not assigned.';
  return {kind,start:daily[0].date,finish:daily.at(-1)!.date,workdays,hours,daily,staffingNote:staffingNote+(day0?` Day 0: ${day0} (activation).`:' Activation date unavailable; Build Start is Day 0.')};
 });
}
