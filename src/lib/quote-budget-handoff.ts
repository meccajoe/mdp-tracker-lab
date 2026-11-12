import type {calculateQuoteV27,QuoteV27} from './quote-v27';
/** Report the saved quote calculation; never redistribute or change its hours. */
export function budgetHandoffHours(quote:QuoteV27,calculation:ReturnType<typeof calculateQuoteV27>){
 const trades=Object.entries(calculation.tradeHours).filter(([,hours])=>hours!==0).map(([id,hours])=>({id,name:quote.trades.find(trade=>trade.id===id)?.name||`Unknown trade (${id})`,hours})).sort((a,b)=>a.name.localeCompare(b.name));
 return {total:calculation.totals.hoursAllowed,trades,assigned:trades.reduce((sum,trade)=>sum+trade.hours,0),untyped:calculation.lines.reduce((sum,line)=>sum+line.untypedHours,0),overallocated:calculation.lines.reduce((sum,line)=>sum+line.overallocatedTradeHours,0)};
}
