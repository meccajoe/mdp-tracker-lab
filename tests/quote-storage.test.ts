import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateStorage,defaultStorage,parseStorage} from '../src/lib/quote-storage';
import {readFileSync} from 'node:fs';
import {parseQuoteV27} from '../src/lib/quote-v27-validation';
import {calculateQuoteV27,EMPTY_INPUTS,applyLevyPricing} from '../src/lib/quote-v27';
import {cloneQuoteItem,deleteQuoteItem} from '../src/lib/quote-item-actions';

test('reproduces every square-foot workbook option at 625 sq ft',()=>{
  for(const [rate,monthly,annual] of [[1.25,781.25,9375],[1.73,1081.25,12975],[2,1250,15000],[2.25,1406.25,16875]]){
    const s=defaultStorage();s.footprint=625;s.settings.squareFootRate=rate;
    assert.deepEqual(calculateStorage(s).selected,{method:1,monthly,annual,contract:annual});
  }
});
test('reproduces cubic-foot height and floor-to-ceiling options',()=>{
  const s=defaultStorage();s.footprint=625;s.method=2;
  for(const [height,monthly] of [[4,2250],[6,3375],[8,4500]]){
    s.itemHeight=height;assert.equal(calculateStorage(s).selected.monthly,monthly);
  }
  s.method=3;assert.equal(calculateStorage(s).selected.monthly,5625);
  s.settings.floorToCeilingRate=.5;assert.equal(calculateStorage(s).selected.annual,75000);
});
test('term, method and settings persist independently; default is empty Method 1',()=>{
  const s=defaultStorage();assert.equal(s.method,1);assert.equal(calculateStorage(s).selected.contract,0);
  s.footprint=100;s.months=3;s.settings.squareFootRate=2.25;
  const saved=parseStorage(JSON.parse(JSON.stringify(s)));
  assert.equal(calculateStorage(saved).selected.contract,675);
  assert.equal(calculateStorage(saved).selected.annual,2700);
  assert.deepEqual(saved,s);
});
test('rejects invalid methods, dimensions, rates and term',()=>{
  for(const bad of [{method:4},{months:0},{footprint:-1},{itemHeight:Infinity}])assert.throws(()=>parseStorage({...defaultStorage(),...bad}));
  assert.throws(()=>parseStorage({...defaultStorage(),settings:{...defaultStorage().settings,cubicFootRate:-1}}));
});

test('storage saves, updates a linked price, preserves overrides and does not create labor or PM fees',()=>{
  const quote=parseQuoteV27(JSON.parse(readFileSync('src/data/quote-v27-fonroche.json','utf8')));
  const before=calculateQuoteV27(quote),prior=JSON.stringify(quote);
  const storage=defaultStorage();storage.footprint=625;
  quote.storage=storage;
  assert.equal(calculateQuoteV27(quote).totals.price,before.totals.price);
  quote.lines.push({id:'storage',name:'Storage',type:'Storage',takeoffDriven:false,inputs:{...EMPTY_INPUTS,cost:100},overrides:{},priceOverride:null});
  storage.lineId='storage';
  const saved=parseQuoteV27(JSON.parse(JSON.stringify(quote)));
  assert.deepEqual(saved.storage,storage);
  let result=calculateQuoteV27(saved),line=result.lines.find(l=>l.id==='storage')!;
  assert.equal(line.finalPrice,15000);assert.equal(line.buildBudget,100);
  assert.equal(line.hoursAllowed,0);assert.equal(line.indirect+line.contingency+line.waste,0);
  assert.deepEqual(result.lines.slice(0,-1),before.lines);
  saved.storage!.method=2;assert.equal(calculateQuoteV27(saved).lines.at(-1)!.finalPrice,27000);
  saved.lines.at(-1)!.priceOverride=123.45;assert.equal(calculateQuoteV27(saved).lines.at(-1)!.finalPrice,123.45);
  saved.lines.at(-1)!.priceOverride=null;
  const cloneId=cloneQuoteItem(saved,'storage');assert.equal(calculateQuoteV27(saved).lines.find(l=>l.id===cloneId)!.finalPrice,27000);
  deleteQuoteItem(saved,'storage');assert.equal(saved.storage!.lineId,null);assert.doesNotThrow(()=>parseQuoteV27(saved));
  assert.equal(JSON.stringify(parseQuoteV27(JSON.parse(prior))),prior);
});

test('old levy maps need no new key and storage uses saved upward rounding policy',()=>{
  const quote=parseQuoteV27(JSON.parse(readFileSync('src/data/quote-v27-blank.json','utf8')));
  const original=JSON.stringify(quote);
  assert.equal(JSON.stringify(parseQuoteV27(quote)),original);
  quote.storage=defaultStorage();quote.storage.footprint=625;quote.storage.months=1;quote.storage.settings.squareFootRate=1.73;quote.storage.lineId='storage';
  quote.lines.push({id:'storage',name:'Storage',type:'Storage',takeoffDriven:false,inputs:{...EMPTY_INPUTS},overrides:{},priceOverride:null});
  const base=calculateQuoteV27(quote).lines.at(-1)!;
  assert.equal(base.calculatedPrice,1081.25);
  applyLevyPricing(quote);quote.pricingVersion='scoped-levies-v2';delete (quote.contingencyByType as Partial<NonNullable<typeof quote.contingencyByType>>).Storage;
  assert.equal(calculateQuoteV27(parseQuoteV27(quote)).lines.at(-1)!.calculatedPrice,1082);
});
