/** Shared staffing pool; original roster and quote trade names remain intact. */
export function capacityTrade(name:string):string {
 if(['crate & pack','crate and pack','packing','final prep','stage / pack / prep','stage, pack & prep','stage, pack & prep for shipping'].includes(name.trim().toLowerCase()))return 'Crate & pack';
 if(['graphic install','graphics install','vinyl install','graphic / vinyl install'].includes(name.trim().toLowerCase()))return 'Graphic / Vinyl Install';
 return ['paint','painting','finish','finishing','finish / paint'].includes(name.trim().toLowerCase())?'Finish / Paint':name;
}
export function capacityTradeHours(hours:Record<string,number>):Record<string,number>{
 const result:Record<string,number>={};for(const [trade,value] of Object.entries(hours)){const key=capacityTrade(trade);result[key]=(result[key]??0)+value;}return result;
}

export function remainingTradeHours(base:Record<string,number>,overrides:Record<string,number>):Record<string,number>{
 const result=capacityTradeHours({...base,...overrides});
 for(const pool of ['Finish / Paint','Graphic / Vinyl Install'])if(overrides[pool]!==undefined)result[pool]=overrides[pool];
 return result;
}

/** Packing uses the I&D staffing pool without changing saved demand trade identities. */
export function staffingTrade(name:string):string {const trade=capacityTrade(name);return trade==='Crate & pack'?'I&D':trade;}
