export const QUOTE_SALESPEOPLE=['Paul Mecca','Maria Mecca','Peyton Hromcik','Kenneth Mecca','Carlos Chaidez'] as const;
export function quoteSalesperson(value:unknown):string {
 return typeof value==='string'?value.trim():'';
}
export function matchesSalesperson(value:unknown,filter:string):boolean {
 const name=quoteSalesperson(value);
 return filter==='all'||(filter==='unassigned'?!name:filter===`person:${name}`);
}
export function salespersonOptions(values:unknown[]):string[]{
 return [...new Set([...QUOTE_SALESPEOPLE,...values.map(quoteSalesperson).filter(Boolean)])].sort((a,b)=>a.localeCompare(b));
}
