import {validDate} from './quote-schedule';

export type ProductionCalendar={saturday:boolean;sunday:boolean};
export const WEEKDAYS:ProductionCalendar={saturday:false,sunday:false};
export function parseProductionCalendar(value:unknown):ProductionCalendar{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid production calendar.');
  const calendar=value as ProductionCalendar;
  if(typeof calendar.saturday!=='boolean'||typeof calendar.sunday!=='boolean')throw new Error('Weekend work must be true or false.');
  return {saturday:calendar.saturday,sunday:calendar.sunday};
}
export function isProductionDay(day:number,calendar:ProductionCalendar=WEEKDAYS){
  const weekday=new Date(day*86400000).getUTCDay();
  return weekday===6?calendar.saturday:weekday===0?calendar.sunday:true;
}
export function productionDays(start:string,finish:string,calendar:ProductionCalendar=WEEKDAYS){
  if(!validDate(start)||!validDate(finish)||finish<start)return [];
  const result:number[]=[];
  for(let day=Date.parse(`${start}T00:00:00Z`)/86400000;day<=Date.parse(`${finish}T00:00:00Z`)/86400000;day++)if(isProductionDay(day,calendar))result.push(day);
  return result;
}
