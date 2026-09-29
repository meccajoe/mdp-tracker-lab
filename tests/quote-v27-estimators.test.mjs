import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateQuoteV27 } from '../src/lib/quote-v27.ts';
import { emptyEstimators, parseEstimators } from '../src/lib/quote-v27-estimators.ts';
const source=JSON.parse(readFileSync(new URL('../src/data/quote-v27-fonroche.json',import.meta.url)));
const fresh=()=>structuredClone(source);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('live estimator formulas preserve every cached Fonroche line and upstream totals',()=>{
  const q=fresh(),r=calculateQuoteV27(q),e=r.estimators;
  const expected=JSON.parse(readFileSync(new URL('./fixtures/quote-v27/fonroche.json',import.meta.url))).expected;
  for(const saved of expected.lines)for(const [key,value]of Object.entries(saved))if(key!=='id')near(r.lines.find(l=>l.id===saved.id)[key],value);
  near(r.totals.price,28953.192);near(r.totals.buildBudget,11890.64);
  near(e.travel[0].cost,3500);near(e.travel[0].shared,325);near(e.travelCost,3825);
  near(e.install[0].days,4);near(e.install[0].billing,5985);near(e.supportBilling,2990);
  near(e.travel[0].hotelNights,4);near(e.shippingCost,0);
});
test('travel stay/return shape changes expenses and install travel days',()=>{
  const q=fresh();q.estimators.travel.people.lead.stays=false;
  const e=calculateQuoteV27(q).estimators;
  near(e.travel[0].trips,2);near(e.travel[0].travelDays,4);near(e.travel[0].roadDays,6);
  near(e.travel[0].hotelNights,4);near(e.travelCost,5110);near(e.install[0].billing,7980);
});
test('travel off days and billed install off days remain independent',()=>{
  const q=fresh();q.estimators.travel.people.lead.offDays=2;
  const r=calculateQuoteV27(q);near(r.estimators.install[0].billing,5985);near(r.estimators.travelCost,4460);
  q.estimators.install.lead.offDays=2;near(calculateQuoteV27(q).estimators.install[0].billing,7980);
});
test('shared travel allocation preserves total; zero road-days costs remain assigned',()=>{
  const q=fresh();const p=q.estimators.travel.people.pm;p.traveling=true;p.installDays=1;
  let e=calculateQuoteV27(q).estimators;
  near(e.travel.reduce((n,p)=>n+p.total,0),e.travelCost);
  near(e.travel[0].shared,325*5/8);near(e.travel[1].shared,325*3/8);
  for(const p of Object.values(q.estimators.travel.people))p.traveling=false;
  q.estimators.travel.rates.other=100;e=calculateQuoteV27(q).estimators;
  near(e.travelCost,100);near(e.lineInputs['line-34'].cost,100);assert.ok(e.warnings.length);
});
test('shipping modes include correct fuel, rental, wear and driver costs',()=>{
  const q=fresh(),leg=q.estimators.shipping.outbound;
  Object.assign(leg,{enabled:true,miles:1000,misc:20,driver:'Shop driver'});
  near(calculateQuoteV27(q).estimators.shippingCost,2452.5);
  leg.mode='Rented truck';near(calculateQuoteV27(q).estimators.shippingCost,2502.5);
  for(const mode of ['LTL freight','FTL freight']){leg.mode=mode;leg.carrierQuote=1000;const e=calculateQuoteV27(q).estimators;near(e.shippingCost,1020);near(e.shipping[0].days,0);}
  leg.enabled=false;near(calculateQuoteV27(q).estimators.shippingCost,0);
});
test('lead shipping days are a reminder, never double-counted as install labor',()=>{
  const q=fresh();Object.assign(q.estimators.shipping.outbound,{enabled:true,miles:1000});
  const e=calculateQuoteV27(q).estimators;near(e.leadDrivingDays,2);near(e.install[0].days,4);near(e.shipping[0].driver,0);
  assert.ok(e.warnings.some(w=>w.includes('does not add or bill')));
});
test('beMatrix rounds geometry, groups by stable item ID and permits zero sqft override',()=>{
  const q=fresh();q.estimators.beMatrix.walls=[{id:'wall-a',lineId:'line-27',width:7,height:9,sides:2,sqftOverride:null},{id:'wall-b',lineId:'line-27',width:3.25,height:8,sides:1,sqftOverride:0}];
  const r=calculateQuoteV27(q),line=r.lines.find(l=>l.id==='line-27');
  near(line.inputs.panels,7);near(line.inputs.sqft,126);near(line.inputs.rental,1750);near(line.finalPrice,4900);
  near(line.hoursAllowed,7*12.5*2/60);near(line.materialsBudget,819);
});
test('input overrides and nullable restoration survive JSON snapshots',()=>{
  const q=fresh();q.lines.find(l=>l.id==='line-28').overrides.cost=0;
  q.estimators.install.lead.installDays=2;
  let r=calculateQuoteV27(JSON.parse(JSON.stringify(q)));near(r.lines.find(l=>l.id==='line-28').finalPrice,0);
  q.lines.find(l=>l.id==='line-28').overrides.cost=null;
  r=calculateQuoteV27(q);near(r.lines.find(l=>l.id==='line-28').finalPrice,7980);
});
test('older snapshots remain frozen and empty estimators do not invent demand',()=>{
  const old=JSON.parse(readFileSync(new URL('./fixtures/quote-v27/fonroche.json',import.meta.url))).quote;
  near(calculateQuoteV27(old).totals.price,28953.192);
  old.estimators=emptyEstimators();near(calculateQuoteV27(old).totals.price,28953.192);
});
test('bad links, ambiguous outputs, geometry and signed hotel adjustments are validated',()=>{
  for(const change of [q=>q.estimators.shipping.rates.mpg=0,q=>q.estimators.beMatrix.frameWidth=0,q=>q.estimators.shipping.lineId='missing',q=>q.estimators.travel.otherLineId='line-32',q=>q.estimators.travel.people.lead.hotelAdjustment=-5,q=>q.estimators.travel.people.pm.useInstallDays=true]){const q=fresh();change(q);assert.throws(()=>calculateQuoteV27(q));}
  const q=fresh();q.estimators.travel.people.lead.hotelAdjustment=-1;near(calculateQuoteV27(q).estimators.travel[0].hotelNights,3);
  assert.throws(()=>parseEstimators({version:1}));
});
