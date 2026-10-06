import {emptyEstimators} from './quote-v27-estimators';
import {calculateQuoteV27,type QuoteV27} from './quote-v27';
/** Independent library snapshot: never holds a live pointer to the source quote. */
export function prequoteSnapshot(source:QuoteV27,lineId:string):QuoteV27 {
 const original=source.lines.find(line=>line.id===lineId);
 if(!original)throw new Error('Choose an item to save.');
 const next=structuredClone(source),calculated=calculateQuoteV27(source).lines.find(line=>line.id===lineId)!;
 next.lines=[{...structuredClone(original),inputs:{...calculated.calculatedInputs}}];
 next.takeoffs=next.takeoffs.filter(row=>row.lineId===lineId);
 const used=new Set(next.takeoffs.map(row=>row.materialId));next.catalog=next.catalog.filter(material=>used.has(material.id));
 delete next.schedule;delete next.planning;delete next.reusableItemIds;delete next.catalogUsage;
 if(next.estimators){
  const walls=next.estimators.beMatrix.walls.filter(wall=>wall.lineId===lineId);
  // Other service items keep effective inputs, not unrelated trip/crew data.
  if(!walls.length)delete next.estimators;
  else next.estimators={...emptyEstimators(),beMatrix:{...next.estimators.beMatrix,walls}};
 }
 return next;
}
