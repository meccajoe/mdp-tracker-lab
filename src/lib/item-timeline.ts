import {calculateQuoteV27,type QuoteV27} from './quote-v27';
import type {StageId} from './production-progress';

const TRADE_STAGES:Record<string,StageId>={
  'cad':'cad','drawings':'cad','design':'cad','design / engineering / cad':'cad',
  'cnc':'cnc','cnc + cutting':'cnc','cnc cutting':'cnc','cnc + cut':'cnc','cnc/cutting':'cnc',
  'carpentry':'carpentry','assembly':'carpentry','carpentry/assembly':'carpentry',
  'finish':'finish','painting':'finish','paint':'finish','finish/paint':'finish',
  'graphics':'graphics','graphic install':'graphics','graphics install':'graphics','vinyl install':'graphics',
  'crate & pack':'packing','crate and pack':'packing','packing':'packing','final prep':'packing','stage / pack / prep':'packing',
};
export const stageForTrade=(name:string)=>{const key=name.trim().toLowerCase();return Object.hasOwn(TRADE_STAGES,key)?TRADE_STAGES[key]:undefined;};
export type ItemTimeline={id:string;number:number;name:string;type:string;hours:number;stages:Partial<Record<StageId,number>>;trades:Record<string,number>;other:Record<string,number>;untyped:number;overallocated:number};
/** Use the same extended takeoff hours and unique trade-name fallback as Capacity.
 * Never scale named trades to overrides or spread a shared CAD fee across items. */
export function itemTimelines(quote:QuoteV27):ItemTimeline[]{
  const calculation=calculateQuoteV27(quote);
  return calculation.lines.flatMap((line,index)=>{
    const rows=calculation.takeoffs.filter(row=>row.lineId===line.id);
    const quoted=line.finalPrice!==0||line.buildBudget!==0||line.hoursAllowed!==0||rows.length>0||Object.values(line.inputs).some(n=>n!==0)||Boolean(quote.productionProgress?.items[line.id]);
    if(!quoted)return [];
    const trades:Record<string,number>=Object.create(null),other:Record<string,number>=Object.create(null),stages:Partial<Record<StageId,number>>={};
    for(const row of rows){
      if(!row.extendedHours)continue;
      const matches=row.tradeId?quote.trades.filter(t=>t.id===row.tradeId):quote.trades.filter(t=>t.name.toLowerCase()===row.description.toLowerCase());
      if(matches.length===1)trades[matches[0].name]=(trades[matches[0].name]??0)+row.extendedHours;
    }
    // Dedicated service rows have an authoritative allowed-hour total. Treat
    // their trade detail as descriptive, not additional stage labor.
    if(line.type==='Design / Engineering / CAD')stages.cad=line.hoursAllowed;
    else if(line.type==='Stage / Pack / Prep')stages.packing=line.hoursAllowed;
    else for(const [name,hours] of Object.entries(trades)){
      const stage=stageForTrade(name);
      if(stage)stages[stage]=(stages[stage]??0)+hours;else other[name]=hours;
    }
    const attributed=Object.values(stages).reduce((sum,h)=>sum+h,0)+Object.values(other).reduce((sum,h)=>sum+h,0);
    return [{id:line.id,number:index+1,name:line.name,type:line.type,hours:line.hoursAllowed,stages,trades,other,untyped:Math.max(0,line.hoursAllowed-attributed),overallocated:Math.max(0,attributed-line.hoursAllowed)}];
  });
}
export function quotedStageHours(items:ItemTimeline[]){
  const result:Partial<Record<StageId,number>>={};
  for(const item of items)for(const [stage,hours] of Object.entries(item.stages))result[stage as StageId]=(result[stage as StageId]??0)+hours;
  return result;
}
