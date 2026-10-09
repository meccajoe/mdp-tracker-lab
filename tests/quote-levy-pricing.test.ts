import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyLevyPricing,calculateQuoteV27,DEFAULT_CONTINGENCY_TYPES,EMPTY_INPUTS,LINE_TYPES,type LineType} from '../src/lib/quote-v27';
import {createBlankQuoteV27} from '../src/lib/quote-v27-template';
import {parseQuoteV27} from '../src/lib/quote-v27-validation';
import {quoteDemand} from '../src/lib/capacity';
import {prequoteSnapshot} from '../src/lib/quote-prequote';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const cents=(n:number)=>Number(n.toFixed(2));
function example(type:LineType='Fabrication'){
 const q=createBlankQuoteV27();delete q.estimators;
 q.settings.burdenedRateOverride=39.27;
 q.lines=[{id:'example',name:'Example',type,takeoffDriven:false,inputs:{...EMPTY_INPUTS,materials:1000,hours:10,cost:1000},overrides:{},priceOverride:null}];
 return q;
}
test('Paul fabrication examples preserve rate-card dollar margin while charging all applicable percentages',()=>{
 const q=example();const r=calculateQuoteV27(q),l=r.lines[0];
 assert.deepEqual([l.finalPrice,l.contingency,l.indirect,l.waste,l.buildBudget,l.margin,r.totals.opex,r.totals.netProfit].map(cents),[3513.81,175.69,140.55,17.57,1392.70,1787.30,1405.52,363.90]);
 assert.equal((l.marginPercent!*100).toFixed(1),'50.9');assert.equal(l.belowOverhead,false);
 q.commission=.1;const commissioned=calculateQuoteV27(q).lines[0];
 assert.equal(cents(commissioned.finalPrice),3950.31);close(commissioned.margin,1787.30);assert.equal((commissioned.marginPercent!*100).toFixed(1),'45.2');
});
test('freight has no contingency and warns when margin does not cover 40% overhead',()=>{
 const r=calculateQuoteV27(example('Freight')),l=r.lines[0];
 assert.deepEqual([l.finalPrice,l.contingency,l.indirect,l.waste,l.margin].map(cents),[1675.39,0,67.02,8.38,600]);
 assert.equal((l.marginPercent!*100).toFixed(1),'35.8');assert.equal(l.belowOverhead,true);
});
test('manual prices including zero stay literal; discount and margin absorb the shortfall',()=>{
 const q=example();q.lines[0].priceOverride=3000;
 let r=calculateQuoteV27(q);assert.equal(r.lines[0].finalPrice,3000);close(r.lines[0].calculatedPrice,3180/.905);close(r.totals.discount,3000-3180/.905);close(r.totals.margin,1322.30);
 q.lines[0].priceOverride=0;r=calculateQuoteV27(q);assert.equal(r.totals.price,0);assert.equal(r.totals.margin,-1392.7);assert.ok(r.totals.discount<0);
});
test('PM uses final hard-scope prices then its own commission and levy gross-up, with no contingency',()=>{
 const q=example();q.commission=.1;q.lines[0].priceOverride=3000;
 q.lines.push({...q.lines[0],id:'freight',type:'Freight',priceOverride:null});
 q.lines.push({...q.lines[0],id:'travel',type:'Travel & Expenses',priceOverride:null});
 q.lines.push({...q.lines[0],id:'pm',type:'Project Management Fee',inputs:{...EMPTY_INPUTS},priceOverride:null});
 let r=calculateQuoteV27(q),pm=r.lines[3];close(pm.finalPrice,3000*.03/.855);assert.equal(pm.contingency,0);close(pm.margin,90);
 q.lines[3].priceOverride=75;r=calculateQuoteV27(q);assert.equal(r.lines[3].finalPrice,75);close(r.lines[3].calculatedPrice,90/.855);
 close(r.totals.waste,r.lines.reduce((sum,line)=>sum+line.waste,0));
});
test('eligibility covers every line type, is editable and survives snapshots and reusable extraction',()=>{
 const q=example();assert.deepEqual(LINE_TYPES.filter(type=>q.contingencyByType![type]),['Fabrication','Graphics','Lead Installer — Install','Lead Installer — Dismantle','Install Support Labor','Stage / Pack / Prep','Installer Days']);
 for(const type of LINE_TYPES){q.lines[0].type=type;const l=calculateQuoteV27(q).lines[0];close(l.contingency,l.finalPrice*(DEFAULT_CONTINGENCY_TYPES.includes(type)?.05:0));}
 q.lines[0].type='Fabrication';q.contingencyByType!.Fabrication=false;
 close(calculateQuoteV27(q).lines[0].finalPrice,3180/.955);
 const parsed=parseQuoteV27(JSON.parse(JSON.stringify(q)));assert.deepEqual(parsed.contingencyByType,q.contingencyByType);assert.equal(parsed.settings.waste,.005);
 assert.equal(prequoteSnapshot(parsed,'example').pricingVersion,'levies-v1');
});
test('invalid gross-up or incomplete pricing configuration is rejected',()=>{
 const q=example();q.commission=.905;assert.throws(()=>calculateQuoteV27(q),/less than 100%/);
 q.commission=0;q.settings.waste=1;assert.throws(()=>calculateQuoteV27(q));
 q.settings.waste=.005;q.contingencyByType!['Project Management Fee']=true;assert.throws(()=>parseQuoteV27(q),/must not carry/);
 q.contingencyByType!['Project Management Fee']=false;delete q.settings.waste;assert.throws(()=>parseQuoteV27(q));
});
test('historical snapshots retain prices until explicit adoption; budgets, hours, rate card and source stay intact',()=>{
 const original=JSON.parse(readFileSync(new URL('../src/data/quote-v27-fonroche.json',import.meta.url),'utf8'));
 const q=parseQuoteV27(original),before=calculateQuoteV27(q),demand=quoteDemand(q),snapshot=JSON.stringify(original);
 close(before.totals.price,28953.192);assert.equal(before.totals.waste,0);
 const settings={...q.settings};applyLevyPricing(q);const after=calculateQuoteV27(parseQuoteV27(q));
 assert.equal(q.settings.opex,.4);assert.equal(q.settings.waste,.005);
 for(const key of Object.keys(settings) as (keyof typeof settings)[])if(key!=='opex')assert.equal(q.settings[key],settings[key]);
 close(after.totals.buildBudget,before.totals.buildBudget);assert.deepEqual(after.tradeHours,before.tradeHours);
 const nextDemand=quoteDemand(q);assert.equal(nextDemand.shop,demand.shop);assert.equal(nextDemand.field,demand.field);assert.equal(nextDemand.design,demand.design);close(nextDemand.price,after.totals.price);
 assert.equal(JSON.stringify(original),snapshot);
});
