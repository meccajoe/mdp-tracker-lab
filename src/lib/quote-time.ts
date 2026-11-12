export type QuoteTimeSpan={id:string;start:string;end:string};
export function parseQuoteTimeSpans(input:unknown):QuoteTimeSpan[]{
 if(!Array.isArray(input)||input.length>100)throw Error('Invalid time log.');
 return input.map(row=>{
  if(!row||typeof row.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)||typeof row.start!=='string'||typeof row.end!=='string')throw Error('Invalid time log.');
  const start=Date.parse(row.start),end=Date.parse(row.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>60000||end>Date.now()+60000)throw Error('Invalid time interval.');
  return {id:row.id,start:new Date(start).toISOString(),end:new Date(end).toISOString()};
 });
}
export const spanMilliseconds=(spans:QuoteTimeSpan[])=>spans.reduce((total,s)=>total+Date.parse(s.end)-Date.parse(s.start),0);
export function quoteTimeLabel(ms:number){const seconds=Math.floor(Math.max(0,ms)/1000);return `${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
