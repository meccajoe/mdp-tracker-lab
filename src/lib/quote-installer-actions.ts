import type {QuoteV27} from './quote-v27';
import {installerIds,isExtraInstallerId,type ExtraInstallerId} from './quote-v27-estimators';
import {deleteQuoteItem} from './quote-item-actions';
/** Defaults alone are not entered work. Disabled travelers may still have saved day counts. */
export function installerHasEnteredWork(quote:QuoteV27,id:ExtraInstallerId){
 const e=quote.estimators,p=e?.install[id],t=e?.travel.people[id];
 if(!p||!t)throw Error('Choose an existing additional installer.');
 const line=quote.lines.find(line=>line.id===p.lineId);
 return p.installDays+p.offDays+p.dismantleDays>0||p.travelDaysOverride!==null||
 t.traveling||t.installDays+t.offDays+t.dismantleDays>0||t.hotelAdjustment!==0||t.daysPerTrip!==2||
 Boolean(line&&(line.priceOverride!==null||Object.values(line.inputs).some(v=>v!==0)||Object.values(line.overrides).some(v=>v!=null)))||
 quote.takeoffs.some(row=>row.lineId===p.lineId);
}
export function removeInstaller(quote:QuoteV27,id:ExtraInstallerId){
 const e=quote.estimators;
 if(!isExtraInstallerId(id)||!e?.install[id]||!e.travel.people[id])throw Error('Choose an existing additional installer.');
 // Never recycle a removed recipient identity in later saved revisions.
 e.nextInstallerNumber=Math.max(e.nextInstallerNumber??4,...installerIds(e).filter(isExtraInstallerId).map(key=>Number(key.slice(10))+1));
 const lineId=e.install[id].lineId;
 if(lineId&&quote.lines.some(line=>line.id===lineId))deleteQuoteItem(quote,lineId);
 delete e.install[id];delete e.travel.people[id];
}
