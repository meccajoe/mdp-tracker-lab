import {emptyEstimators} from './quote-v27-estimators';
import {calculateQuoteV27,type QuoteV27} from './quote-v27';
/** Copy one saved item into a draft, preserving custom costs and using fresh catalog prices. */
export function insertReusableItem(target:QuoteV27,source:QuoteV27,lineId:string,live:QuoteV27['catalog']) {
  if(source.takeoffs.some(row=>!row.lineId&&(row.materialId||row.quantity||row.hours||row.notes||row.description!=='Untitled takeoff')))throw new Error('This reusable item has unassigned takeoff rows. Assign them to its item in the library before inserting.');
  const original=source.lines.find(line=>line.id===lineId);if(!original)throw new Error('Reusable item is missing.');
  const available=target.lines.findIndex(line=>/^(Item \d+|Spare \d+)$/.test(line.name)&&line.type==='Fabrication'&&!target.takeoffs.some(row=>row.lineId===line.id)&&Object.values(line.inputs).every(value=>value===0)&&Object.values(line.overrides).every(value=>value==null)&&line.priceOverride===null);
  if(available<0&&target.lines.length>=200)throw new Error('Quote has reached its item limit.');
  const next=structuredClone(target),id=available>=0?next.lines[available].id:crypto.randomUUID();
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
  // Freeze effective service inputs when no corresponding estimator is copied.
  const walls=source.estimators?.beMatrix.walls.filter(wall=>wall.lineId===lineId)??[];
  if(walls.length){next.estimators??=emptyEstimators();next.estimators.beMatrix.walls.push(...walls.map(wall=>({...wall,id:crypto.randomUUID(),lineId:id})));}
  if(available>=0)next.lines[available]=line;else next.lines.push(line);
  const blank=(row:QuoteV27['takeoffs'][number])=>!row.lineId&&!row.materialId&&!row.tradeId&&row.description==='Untitled takeoff'&&!row.quantity&&!row.hours&&!row.notes&&!row.unit&&!(row.unitCostOverride??0)&&!row.resale&&row.sections===null;
  let position=next.takeoffs.length;
  for(let start=0;start<next.takeoffs.length;start++){if(next.takeoffs.slice(start,start+rows.length).every(blank)&&(start+rows.length<=next.takeoffs.length||next.takeoffs.slice(start).every(blank))){position=start;break;}}
  if(Math.max(next.takeoffs.length,position+rows.length)>5000)throw new Error('Quote has reached its row limit.');
  next.takeoffs.splice(position,Math.min(rows.length,next.takeoffs.length-position),...rows);
  if(next.catalog.length>2000){const used=new Set(next.takeoffs.map(row=>row.materialId));next.catalog=next.catalog.filter(material=>used.has(material.id));}
  if(next.catalog.length>2000)throw new Error('Quote has reached its catalog limit.');
  target.lines=next.lines;target.takeoffs=next.takeoffs;target.catalog=next.catalog;target.estimators=next.estimators;
  return id;
}
