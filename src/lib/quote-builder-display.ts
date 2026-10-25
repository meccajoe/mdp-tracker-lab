import type {QuoteV27} from './quote-v27';
/** Template spare slots are ordinary fabrication items; saved names/IDs remain intact. */
export function builderItemName(line:QuoteV27['lines'][number],index:number){return line.type==='Fabrication'&&/^Spare \d+$/.test(line.name)?`Item ${index+1}`:line.name;}
/** Never hide a historical/custom installer row that carries entered work or an override. */
export function showBuilderLine(quote:QuoteV27,line:QuoteV27['lines'][number]){
 const id=(['second','third'] as const).find(id=>quote.estimators?.install[id].lineId===line.id);
 if(!id||!quote.estimators)return true;
 const person=quote.estimators.install[id];
 return person.installDays+person.dismantleDays+person.offDays>0||Boolean(person.travelDaysOverride)||quote.estimators.travel.people[id].traveling||line.priceOverride!==null||Object.values(line.inputs).some(v=>v!==0)||Object.values(line.overrides).some(v=>v!=null)||quote.takeoffs.some(t=>t.lineId===line.id);
}
