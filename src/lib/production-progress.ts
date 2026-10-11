import {validDate} from './quote-schedule';

export const PROGRESS_STAGES=['cad','purchasing','cnc','carpentry','finish','graphics','packing'] as const;
export type StageId=typeof PROGRESS_STAGES[number];
export type CompletionDates=Partial<Record<StageId,string>>;
export type ProductionProgress={stages:CompletionDates;items:Record<string,CompletionDates>};
export const emptyProgress=():ProductionProgress=>({stages:{},items:{}});
/** Dates are reported completion, independent of quote labor and forecast targets. */
export function parseProductionProgress(value:unknown,lineIds:readonly string[]):ProductionProgress{
  const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid production completion dates.');return v as Record<string,unknown>;};
  const dates=(v:unknown):CompletionDates=>Object.fromEntries(Object.entries(object(v)).map(([key,date])=>{
    if(!(PROGRESS_STAGES as readonly string[]).includes(key)||!validDate(date))throw new Error('Choose a valid stage completion date.');
    return [key,date];
  }));
  const root=object(value),items=Object.entries(object(root.items));
  if(items.length>200)throw new Error('Too many item completion dates.');
  return {stages:dates(root.stages),items:Object.fromEntries(items.map(([id,entry])=>{
    if(!lineIds.includes(id))throw new Error('Completion dates must belong to an existing quote item.');
    return [id,dates(entry)];
  }))};
}
export function setCompletionDate(progress:ProductionProgress,stage:StageId,date:string,itemId?:string):ProductionProgress{
  const next=structuredClone(progress);
  if(itemId)next.items={...next.items,[itemId]:{...(Object.hasOwn(next.items,itemId)?next.items[itemId]:{})}};
  const target=itemId?next.items[itemId]:next.stages;
  if(date)target[stage]=date;else delete target[stage];
  if(itemId&&!Object.keys(target).length)delete next.items[itemId];
  return next;
}
