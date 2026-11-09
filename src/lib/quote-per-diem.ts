import type {QuoteV27} from './quote-v27';
import {calculateEstimators,PEOPLE,PERSON_LABELS} from './quote-v27-estimators';
/** Payment allowances from the saved Travel Estimator, never sell prices or current rates. */
export function quotePerDiem(q:QuoteV27){
 if(!q.estimators)return {people:[],perDiem:0,bonus:0,warnings:['This quote has no detailed Travel Estimator. Per diem and lead bonus cannot be reconstructed from a lump-sum travel price.']};
 const e=q.estimators,result=calculateEstimators(q,e),warnings=[...result.warnings];
 const people=PEOPLE.filter(id=>e.travel.people[id].traveling).map(id=>{
  const p=e.travel.people[id],days=p.useInstallDays&&id!=='pm'?e.install[id]:p,t=result.travel.find(t=>t.id===id)!;
  const rows=[['Travel',t.travelDays],['Install',days.installDays],['Dismantle',days.dismantleDays],['Off',p.stays?days.offDays:0]].map(([label,count])=>({label:String(label),days:Number(count),rate:e.travel.rates.perDiem,perDiem:Number(count)*e.travel.rates.perDiem,bonusRate:p.roadBonus?e.travel.rates.roadBonus:0,bonus:Number(count)*(p.roadBonus?e.travel.rates.roadBonus:0)}));
  if(id!=='pm'){const labor=e.install[id],billed=result.install.find(i=>i.id===id)!;if(labor.installDays!==days.installDays||labor.dismantleDays!==days.dismantleDays||labor.offDays!==(p.stays?days.offDays:0)||billed.travelDays!==t.travelDays)warnings.push(`${PERSON_LABELS[id]}: Install Labor and Travel Estimator day counts differ. This payment summary uses Travel Estimator days; review before issuing funds.`);}
  return {id,label:PERSON_LABELS[id],trips:t.trips,rows,days:t.roadDays,perDiem:t.roadDays*e.travel.rates.perDiem,bonus:p.roadBonus?t.roadDays*e.travel.rates.roadBonus:0};
 });
 warnings.push('Installer names and calendar dates for each travel/install/off/dismantle day are not recorded in this quote. Confirm the recipient and daily itinerary before issuing payment. Counts are not a dated itinerary.');
 if(!people.length)warnings.push('No travelers are enabled in the saved Travel Estimator. No per diem or lead road bonus is quoted.');
 return {people,perDiem:people.reduce((s,p)=>s+p.perDiem,0),bonus:people.reduce((s,p)=>s+p.bonus,0),warnings};
}
