import type {calculateQuoteV27,QuoteV27} from './quote-v27';
/** Report existing hours; match legacy labor by exact unique trade name, as Capacity does. */
export function budgetHandoffHours(quote:QuoteV27,calculation:ReturnType<typeof calculateQuoteV27>){
 const legacyByLine=new Map<string,Record<string,number>>();
 for(const row of calculation.takeoffs){
  if(!row.lineId||row.tradeId||!row.extendedHours)continue;
  const matches=quote.trades.filter(trade=>trade.name.toLowerCase()===row.description.toLowerCase());
  if(matches.length!==1)continue;
  const hours=legacyByLine.get(row.lineId)??{},id=matches[0].id;
  hours[id]=(hours[id]??0)+row.extendedHours;legacyByLine.set(row.lineId,hours);
 }
 const combined:Record<string,number>={};
 const lines=calculation.lines.map(line=>{
  const tradeHours={...line.tradeHours};
  for(const [id,hours] of Object.entries(legacyByLine.get(line.id)??{}))tradeHours[id]=(tradeHours[id]??0)+hours;
  const assigned=Object.values(tradeHours).reduce((sum,hours)=>sum+hours,0);
  for(const [id,hours] of Object.entries(tradeHours))combined[id]=(combined[id]??0)+hours;
  return {...line,tradeHours,untypedHours:Math.max(0,line.hoursAllowed-assigned),overallocatedTradeHours:Math.max(0,assigned-line.hoursAllowed)};
 });
 const namedPurposes=new Set(['Design / Engineering / CAD','Lead Installer — Install','Lead Installer — Dismantle','Off Days — Lead','Off Days — Support','Install Support Labor','Travel — Lead Installer','Travel — Project Manager','Travel — Install Support','Stage / Pack / Prep','Disposal','Installer Days']);
 const otherHours=lines.filter(line=>line.untypedHours>0).map(line=>({id:line.id,name:line.name,type:line.type,hours:line.untypedHours,purposeKnown:namedPurposes.has(line.type)}));
 const purposeHours=otherHours.filter(line=>line.purposeKnown).reduce((sum,line)=>sum+line.hours,0),needsTradeHours=otherHours.filter(line=>!line.purposeKnown).reduce((sum,line)=>sum+line.hours,0);
 const trades=Object.entries(combined).filter(([,hours])=>hours!==0).map(([id,hours])=>({id,name:quote.trades.find(trade=>trade.id===id)?.name||`Unknown trade (${id})`,hours})).sort((a,b)=>a.name.localeCompare(b.name));
 return {lines,otherHours,purposeHours,needsTradeHours,total:calculation.totals.hoursAllowed,trades,assigned:trades.reduce((sum,trade)=>sum+trade.hours,0),untyped:lines.reduce((sum,line)=>sum+line.untypedHours,0),overallocated:lines.reduce((sum,line)=>sum+line.overallocatedTradeHours,0)};
}
