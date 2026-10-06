import {calculateQuoteV27,type QuoteV27} from './quote-v27';
/** Purchasing uses recorded takeoff costs, never current inventory prices. */
export function quoteBOM(quote:QuoteV27){
 const groups=new Map<string,{name:string;unit:string;quantity:number;unitCost:number;cost:number;items:Set<string>}>();
 for(const row of calculateQuoteV27(quote).takeoffs){
  const material=quote.catalog.find(m=>m.id===row.materialId),unit=row.unit??material?.unit??'';
  if(!row.quantity||/^(hours?|hrs?)$/i.test(unit))continue;
  const name=material?.name??row.description,key=JSON.stringify([name,unit]);
  const group=groups.get(key)??{name,unit,quantity:0,unitCost:row.unitCost,cost:0,items:new Set<string>()};
  group.quantity+=row.quantity*(row.sections??1);group.cost+=row.cost;group.items.add(quote.lines.find(line=>line.id===row.lineId)?.name??'Unassigned');groups.set(key,group);
 }
 return Array.from(groups.values()).map(row=>({...row,items:Array.from(row.items)}));
}
