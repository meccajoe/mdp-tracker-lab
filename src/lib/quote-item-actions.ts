import {calculateQuoteV27,EMPTY_INPUTS,type QuoteV27} from './quote-v27';
/** Reset a quote slot without changing any other item's stable identity. Undo retains the full prior snapshot. */
export function clearQuoteItem(quote:QuoteV27,id:string){
 const index=quote.lines.findIndex(line=>line.id===id);
 if(index<0)throw new Error('Choose an existing quote item.');
 quote.lines[index]={id,name:`Item ${index+1}`,type:'Fabrication',takeoffDriven:true,inputs:{...EMPTY_INPUTS},overrides:{},priceOverride:null};
 if(quote.productionProgress)delete quote.productionProgress.items[id];
 quote.takeoffs=quote.takeoffs.filter(row=>row.lineId!==id);
 if(quote.reusableItemIds)quote.reusableItemIds=quote.reusableItemIds.filter(item=>item!==id);
 if(quote.storage?.lineId===id)quote.storage.lineId=null;
 const e=quote.estimators;if(!e)return;
 e.beMatrix.walls=e.beMatrix.walls.filter(wall=>wall.lineId!==id);
 for(const person of ['lead','second','third','support'] as const)if(e.install[person].lineId===id)e.install[person].lineId=null;
 for(const key of ['leadLineId','pmLineId','otherLineId'] as const)if(e.travel[key]===id)e.travel[key]=null;
 if(e.shipping.lineId===id)e.shipping.lineId=null;
}

/** Remove the item and its links; callers capture the whole document for undo. */
export function deleteQuoteItem(quote:QuoteV27,id:string){
 clearQuoteItem(quote,id);
 quote.lines=quote.lines.filter(line=>line.id!==id);
}
/** Clone recorded inputs and takeoffs, never refresh prices or copy completion dates. */
export function cloneQuoteItem(quote:QuoteV27,id:string){
 const index=quote.lines.findIndex(line=>line.id===id);
 if(index<0)throw new Error('Choose an existing quote item.');
 const rows=quote.takeoffs.filter(row=>row.lineId===id);
 if(quote.lines.length>=200||quote.takeoffs.length+rows.length>5000)throw new Error('Quote has reached its item or takeoff row limit.');
 const original=quote.lines[index],calculated=calculateQuoteV27(quote).lines.find(line=>line.id===id)!;
 const copyId=crypto.randomUUID();
 let name=`${original.name} CLONE`,suffix=2;
 while(quote.lines.some(line=>line.name===name))name=`${original.name} CLONE ${suffix++}`;
 const copy={...structuredClone(original),id:copyId,name,inputs:{...calculated.calculatedInputs}};
 quote.lines.splice(index+1,0,copy);
 const last=quote.takeoffs.reduce((last,row,i)=>row.lineId===id?i:last,-1);
 quote.takeoffs.splice(last+1,0,...rows.map(row=>({...structuredClone(row),id:crypto.randomUUID(),lineId:copyId})));
 const walls=quote.estimators?.beMatrix.walls.filter(wall=>wall.lineId===id)??[];
 quote.estimators?.beMatrix.walls.push(...walls.map(wall=>({...wall,id:crypto.randomUUID(),lineId:copyId})));
 return copyId;
}

/** Reorder only: stable IDs keep takeoffs, estimator links and overrides attached. */
export function moveQuoteItem(quote:QuoteV27,id:string,position:number){
 const index=quote.lines.findIndex(line=>line.id===id);
 if(index<0)throw new Error('Choose an existing quote item.');
 if(!Number.isInteger(position)||position<0||position>=quote.lines.length)throw new Error('Choose a valid item position.');
 if(index===position)return;
 const [line]=quote.lines.splice(index,1);
 quote.lines.splice(position,0,line);
}

/** Insert on either side of a drop target without off-by-one errors moving down. */
export function moveQuoteItemRelative(quote:QuoteV27,id:string,targetId:string,after:boolean){
 const source=quote.lines.findIndex(line=>line.id===id),target=quote.lines.findIndex(line=>line.id===targetId);
 if(source<0||target<0)throw new Error('Choose an existing quote item.');
 if(source===target)return;
 moveQuoteItem(quote,id,target+(after?1:0)-(source<target?1:0));
}
