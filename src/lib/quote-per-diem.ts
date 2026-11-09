import type {TravelAdjustments} from './per-diem-adjustments';
import {travelAllowanceRows} from './travel-allowances';
import type {QuoteV27} from './quote-v27';
import {calculateEstimators,PEOPLE,PERSON_LABELS} from './quote-v27-estimators';
/** Payment allowances from the saved Travel Estimator, never sell prices or current rates. */
export function quotePerDiem(q:QuoteV27,adjustments:TravelAdjustments={}){
 if(!q.estimators)return {people:[],perDiem:0,bonus:0,warnings:['This quote has no detailed Travel Estimator. Per diem and lead bonus cannot be reconstructed from a lump-sum travel price.']};
 const e=q.estimators,result=calculateEstimators(q,e),warnings=[...result.warnings];
 const people=PEOPLE.filter(id=>e.travel.people[id].traveling).map(id=>{
  const p=e.travel.people[id],days=p.useInstallDays&&id!=='pm'?e.install[id]:p,t=result.travel.find(t=>t.id===id)!;
  const rows=travelAllowanceRows(q.settings,e.travel.rates,{travel:t.travelDays,install:days.installDays,dismantle:days.dismantleDays,off:p.stays?days.offDays:0},p.roadBonus,adjustments[id]?.rate);
  if(id!=='pm'){const labor=e.install[id],billed=result.install.find(i=>i.id===id)!;if(labor.installDays!==days.installDays||labor.dismantleDays!==days.dismantleDays||labor.offDays!==(p.stays?days.offDays:0)||billed.travelDays!==t.travelDays)warnings.push(`${PERSON_LABELS[id]}: Install Labor and Travel Estimator day counts differ. This payment summary uses Travel Estimator days; review before issuing funds.`);}
  return {id,label:PERSON_LABELS[id],trips:t.trips,rows,days:t.roadDays,perDiem:rows.reduce((sum,r)=>sum+r.perDiem,0),quotedPerDiem:t.perDiem,adjustment:adjustments[id],bonus:t.bonus};
 });
 warnings.push('Calendar dates for each travel/install/off/dismantle day are not recorded in this quote. Recipient names are project assignments, separate from the quoted amounts. Confirm the recipient and daily itinerary before issuing payment. Counts are not a dated itinerary.');
 if(!people.length)warnings.push('No travelers are enabled in the saved Travel Estimator. No per diem or lead road bonus is quoted.');
 return {people,perDiem:people.reduce((s,p)=>s+p.perDiem,0),bonus:people.reduce((s,p)=>s+p.bonus,0),warnings};
}

export function validateTravelAdjustments(q:QuoteV27,adjustments:TravelAdjustments){
 const report=quotePerDiem(q);
 for(const [id,adjustment] of Object.entries(adjustments)){
  const row=report.people.find(p=>p.id===id)?.rows.find(r=>r.label==='Travel');
  if(!row||row.days<=0||adjustment.rate<row.rate)throw Error('Travel adjustments require a quoted traveler with travel days and cannot reduce the quoted daily allowance.');
 }
}
