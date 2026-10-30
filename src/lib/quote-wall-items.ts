import {EMPTY_INPUTS,type QuoteV27} from './quote-v27';
import {emptyEstimators,WALL_TEMPLATE} from './quote-v27-estimators';
/** New walls get one independent item. Existing grouped links are never split implicitly. */
export function addQuoteWall(quote:QuoteV27){
 const slot=quote.lines.find(line=>/^(Item \d+|Spare \d+)$/.test(line.name)&&line.type==='Fabrication'&&!quote.takeoffs.some(row=>row.lineId===line.id)&&Object.values(line.inputs).every(v=>v===0)&&Object.values(line.overrides).every(v=>v==null)&&line.priceOverride===null);
 if(!slot&&quote.lines.length>=200)throw Error('Quote has reached its item limit.');
 quote.estimators??=emptyEstimators();
 const walls=quote.estimators.beMatrix.walls;if(walls.length>=200)throw Error('Quote has reached its wall limit.');
 let n=walls.length+1;while(quote.lines.some(l=>l.name===`Wall ${n}`))n++;
 const name=`Wall ${n}`,lineId=slot?.id??crypto.randomUUID();
 const line={id:lineId,name,type:'beMatrix / SEG' as const,takeoffDriven:true,inputs:{...EMPTY_INPUTS},overrides:{},priceOverride:null};
 if(slot)Object.assign(slot,line);else quote.lines.push(line);
 walls.push({...WALL_TEMPLATE,id:crypto.randomUUID(),lineId,name,dimensionUnit:'ft',frameSize:'39.5x95',quantity:1});
}
export function renameQuoteWall(quote:QuoteV27,id:string,name:string){
 if(!name.trim()||name.trim().length>200)throw Error('Enter a wall name (up to 200 characters).');
 const walls=quote.estimators?.beMatrix.walls??[],wall=walls.find(w=>w.id===id);if(!wall)throw Error('Wall not found.');
 wall.name=name.trim();
 const line=quote.lines.find(l=>l.id===wall.lineId);
 if(line&&walls.filter(w=>w.lineId===line.id).length===1)line.name=wall.name;
}
