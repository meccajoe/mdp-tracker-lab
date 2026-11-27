import {installerIds,personLabel} from './quote-v27-estimators';
import type {QuoteV27} from './quote-v27';
/** Template spare slots are ordinary fabrication items; saved names/IDs remain intact. */
export function builderItemName(line:QuoteV27['lines'][number],index:number){return line.type==='Fabrication'&&/^Spare \d+$/.test(line.name)?`Item ${index+1}`:line.name;}
/** Derive labels from the linked role, leaving saved item identity and names intact. */
export function builderInstallerLabel(quote:QuoteV27,line:QuoteV27['lines'][number]){
 const e=quote.estimators;if(!e||line.type!=='Installer Days')return null;
 const id=installerIds(e).find(id=>e.install[id].lineId===line.id);if(!id)return null;
 const name=e.install[id].name?.trim();return name?`${personLabel(id,e)} — ${name}`:personLabel(id,e);
}
/** Never hide a historical/custom installer row that carries entered work or an override. */
export function showBuilderLine(quote:QuoteV27,line:QuoteV27['lines'][number]){
 const id=(['second','third'] as const).find(id=>quote.estimators?.install[id].lineId===line.id);
 if(!id||!quote.estimators)return true;
 const person=quote.estimators.install[id];
 return Boolean(person.name?.trim())||person.installDays+person.dismantleDays+person.offDays>0||Boolean(person.travelDaysOverride)||quote.estimators.travel.people[id].traveling||line.priceOverride!==null||Object.values(line.inputs).some(v=>v!==0)||Object.values(line.overrides).some(v=>v!=null)||quote.takeoffs.some(t=>t.lineId===line.id);
}

export const builderTypes=['Fabrication','SEG','Bematrix','Equipment','Materials','Props/Decor'].map(value=>[value,value] as const);
export function itemTypeLabel(line:QuoteV27['lines'][number]){return line.itemCategory??typeLabel(line.type);}
export const typeLabel=(type:string)=>({'Graphics':'SEG','beMatrix / SEG':'Bematrix','Equipment Rental':'Equipment','Props / Resale':'Props/Decor'} as Record<string,string>)[type]??type;
