/** Shared staffing pool; original roster and quote trade names remain intact. */
export function capacityTrade(name:string):string {
 return ['paint','painting','finish','finishing','finish / paint'].includes(name.trim().toLowerCase())?'Finish / Paint':name;
}
export function capacityTradeHours(hours:Record<string,number>):Record<string,number>{
 const result:Record<string,number>={};for(const [trade,value] of Object.entries(hours)){const key=capacityTrade(trade);result[key]=(result[key]??0)+value;}return result;
}

export function remainingTradeHours(base:Record<string,number>,overrides:Record<string,number>):Record<string,number>{
 const result=capacityTradeHours({...base,...overrides});
 if(overrides['Finish / Paint']!==undefined)result['Finish / Paint']=overrides['Finish / Paint'];
 return result;
}
