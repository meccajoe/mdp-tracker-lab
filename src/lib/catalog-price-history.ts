export type CatalogAuditDocument={unit_cost:number|string|null;unit:string;updated_at?:string;updated_by?:string|null;source?:string;price_change_source?:{kind:string;workspace_id?:string|null;quote_name?:string|null}};
export function catalogPriceChanges(rows:{revision:number;document:CatalogAuditDocument}[]){
 let previous:CatalogAuditDocument|undefined;
 return [...rows].sort((a,b)=>a.revision-b.revision).flatMap(row=>{
  const current=row.document,oldCost=previous?.unit_cost==null?null:Number(previous.unit_cost),newCost=current.unit_cost==null?null:Number(current.unit_cost),initial=!previous;
  const oldUnit=previous?.unit??current.unit;previous=current;
  if(!initial&&oldCost===newCost)return [];
  return [{revision:row.revision,date:current.updated_at??null,changedById:current.updated_by??null,oldCost,newCost,oldUnit,unit:current.unit,initial,source:current.price_change_source??null,imported:initial&&current.source==='Google Sheet DB'}];
 }).reverse();
}
