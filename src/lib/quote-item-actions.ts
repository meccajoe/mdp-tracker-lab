import {EMPTY_INPUTS,type QuoteV27} from './quote-v27';
/** Reset a quote slot without changing any other item's stable identity. Undo retains the full prior snapshot. */
export function clearQuoteItem(quote:QuoteV27,id:string){
 const index=quote.lines.findIndex(line=>line.id===id);
 if(index<0)throw new Error('Choose an existing quote item.');
 quote.lines[index]={id,name:`Item ${index+1}`,type:'Fabrication',takeoffDriven:true,inputs:{...EMPTY_INPUTS},overrides:{},priceOverride:null};
 quote.takeoffs=quote.takeoffs.filter(row=>row.lineId!==id);
 if(quote.reusableItemIds)quote.reusableItemIds=quote.reusableItemIds.filter(item=>item!==id);
 const e=quote.estimators;if(!e)return;
 e.beMatrix.walls=e.beMatrix.walls.filter(wall=>wall.lineId!==id);
 for(const person of ['lead','second','third','support'] as const)if(e.install[person].lineId===id)e.install[person].lineId=null;
 for(const key of ['leadLineId','pmLineId','otherLineId'] as const)if(e.travel[key]===id)e.travel[key]=null;
 if(e.shipping.lineId===id)e.shipping.lineId=null;
}
