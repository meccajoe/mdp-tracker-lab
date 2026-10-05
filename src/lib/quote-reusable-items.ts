import {calculateQuoteV27,type QuoteV27} from './quote-v27';
/** Copy one saved item into a draft, preserving custom costs and using fresh catalog prices. */
export function insertReusableItem(target:QuoteV27,source:QuoteV27,lineId:string,live:QuoteV27['catalog']) {
  const original=source.lines.find(line=>line.id===lineId);if(!original)throw new Error('Reusable item is missing.');
  if(target.lines.length>=200)throw new Error('Quote has reached its item limit.');
  const next=structuredClone(target),id=crypto.randomUUID();
  let name=original.name,index=2;while(next.lines.some(line=>line.name.toLowerCase()===name.toLowerCase()))name=`${original.name} (${index++})`;
  const calculated=calculateQuoteV27(source).lines.find(line=>line.id===lineId)!;
  const line={...structuredClone(original),id,name,inputs:{...calculated.calculatedInputs}};
  const rows=source.takeoffs.filter(row=>row.lineId===lineId).map(row=>{
    const copy={...row,id:crypto.randomUUID(),lineId:id};
    if(row.materialId){const old=source.catalog.find(material=>material.id===row.materialId)!;
      const matches=live.filter(material=>material.name===old.name&&material.unit===old.unit);
      if(matches.length!==1)throw new Error(`Current inventory match missing or ambiguous: ${old.name}. Update the saved item before inserting.`);
      const material=matches[0],existing=next.catalog.find(entry=>entry.id===material.id);if(existing&&(existing.unitCost!==material.unitCost||existing.name!==material.name||existing.unit!==material.unit))throw new Error('Catalog identity conflict. Refresh inventory before inserting.');if(!existing)next.catalog.push({...material});
      copy.materialId=material.id;copy.unitCostOverride=null;
    }
    if(copy.tradeId){const trade=source.trades.find(t=>t.id===copy.tradeId);copy.tradeId=next.trades.find(t=>t.name===trade?.name)?.id??null;}
    return copy;
  });
  if(next.takeoffs.length+rows.length>5000)throw new Error('Quote has reached its row limit.');
  // Freeze effective service inputs when no corresponding estimator is copied.
  const walls=source.estimators?.beMatrix.walls.filter(wall=>wall.lineId===lineId)??[];
  if(walls.length&&next.estimators)next.estimators.beMatrix.walls.push(...walls.map(wall=>({...wall,id:crypto.randomUUID(),lineId:id})));
  next.lines.push(line);next.takeoffs.push(...rows);
  if(next.catalog.length>2000){const used=new Set(next.takeoffs.map(row=>row.materialId));next.catalog=next.catalog.filter(material=>used.has(material.id));}
  if(next.catalog.length>2000)throw new Error('Quote has reached its catalog limit.');
  target.lines=next.lines;target.takeoffs=next.takeoffs;target.catalog=next.catalog;target.estimators=next.estimators;
  return id;
}
