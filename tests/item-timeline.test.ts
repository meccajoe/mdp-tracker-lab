import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlankQuoteV27} from '../src/lib/quote-v27-template';
import {itemTimelines,quotedStageHours,stageForTrade,isBuildTimelineItem} from '../src/lib/item-timeline';
import {emptyProgress,setCompletionDate} from '../src/lib/production-progress';
import {parseQuoteV27} from '../src/lib/quote-v27-validation';
import {calculateQuoteV27} from '../src/lib/quote-v27';
import {clearQuoteItem} from '../src/lib/quote-item-actions';
import {prequoteSnapshot} from '../src/lib/quote-prequote';
function fixture(){
  const q=createBlankQuoteV27();
  q.trades=[{id:'cnc',name:'CNC + cutting',wage:20},{id:'paint',name:'Painting',wage:20},{id:'graphics',name:'Vinyl Install',wage:20},{id:'electric',name:'Electrical',wage:20}];
  const a=q.lines[0],b=q.lines[1];a.name='Golden Arch';b.name='Cabinet';
  q.takeoffs=[{id:'r1',lineId:a.id,description:'CNC + cutting',materialId:null,tradeId:null,quantity:0,sections:2,unitCostOverride:null,hours:4,resale:false},{id:'r2',lineId:b.id,description:'Paint',materialId:null,tradeId:'paint',quantity:0,sections:null,unitCostOverride:null,hours:10,resale:false},{id:'r3',lineId:b.id,description:'Vinyl',materialId:null,tradeId:'graphics',quantity:0,sections:null,unitCostOverride:null,hours:6,resale:false},{id:'r4',lineId:a.id,description:'Electrical',materialId:null,tradeId:'electric',quantity:0,sections:null,unitCostOverride:null,hours:3,resale:false}];
  q.lines.find(l=>l.type==='Design / Engineering / CAD')!.overrides.hours=12;
  return q;
}
test('items use stable IDs and extended trade hours; CAD is counted once; graphics stays separate',()=>{
  const q=fixture(),items=itemTimelines(q),hours=quotedStageHours(items);
  assert.equal(items.length,4); // two fabricated items, CAD, computed PM fee
  assert.equal(items[0].stages.cnc,8);assert.equal(items[1].stages.finish,10);assert.equal(items[1].stages.graphics,6);
  assert.equal(items[0].other.Electrical,3);assert.equal(items[0].untyped,0);
  assert.equal(hours.cad,12);assert.equal(items[0].stages.cad,undefined);
  q.lines[0].name='Renamed arch';assert.equal(itemTimelines(q)[0].id,items[0].id);
});
test('quote overrides do not silently scale trades or remaining planning hours into item estimates',()=>{
  const q=fixture();q.lines[0].overrides.hours=4;
  q.planning={status:'',remainingShop:1,remainingField:null,remainingTrades:{'CNC + cutting':1},notes:''};
  const item=itemTimelines(q)[0];assert.equal(item.stages.cnc,8);assert.equal(item.hours,4);assert.equal(item.overallocated,7);
  q.lines[0].overrides.hours=20;assert.equal(itemTimelines(q)[0].untyped,9);
});
test('completion dates round-trip independently without changing quote pricing or hours',()=>{
  const q=fixture(),before=calculateQuoteV27(q),old=structuredClone(q);
  q.productionProgress=setCompletionDate(emptyProgress(),'cnc','2026-10-11',q.lines[0].id);
  q.productionProgress=setCompletionDate(q.productionProgress,'cad','2026-10-10');
  const loaded=parseQuoteV27(q);assert.deepEqual(loaded.productionProgress,q.productionProgress);assert.deepEqual(calculateQuoteV27(loaded),before);
  assert.equal(old.productionProgress,undefined);assert.equal('productionProgress' in parseQuoteV27(old),false);
  assert.equal(loaded.productionProgress?.stages.cnc,undefined); // no automatic project completion
  const cleared=setCompletionDate(loaded.productionProgress!,'cnc','',q.lines[0].id);assert.deepEqual(cleared.items,{});
  for(const date of ['2026-02-30','bad',''])assert.throws(()=>parseQuoteV27({...q,productionProgress:{stages:{cad:date},items:{}}}));
  assert.throws(()=>parseQuoteV27({...q,productionProgress:{stages:{},items:{missing:{cad:'2026-10-11'}}}}));
  assert.throws(()=>parseQuoteV27({...q,productionProgress:{stages:{unknown:'2026-10-11'},items:{}}}));
});
test('cleared and reusable items do not carry stale completion dates to the next job',()=>{
  const q=fixture();q.productionProgress=setCompletionDate(emptyProgress(),'cnc','2026-10-11',q.lines[0].id);q.productionCalendar={saturday:true,sunday:true};
  const reusable=prequoteSnapshot(q,q.lines[0].id);assert.equal(reusable.productionProgress,undefined);assert.equal(reusable.productionCalendar,undefined);
  clearQuoteItem(q,q.lines[0].id);assert.deepEqual(q.productionProgress.items,{});parseQuoteV27(q);
});

test('trade labels and item IDs never resolve inherited object properties',()=>{
  assert.equal(stageForTrade('constructor'),undefined);assert.equal(stageForTrade('__proto__'),undefined);
  const p=setCompletionDate(emptyProgress(),'cnc','2026-10-11','__proto__');
  assert.ok(Object.hasOwn(p.items,'__proto__'));assert.equal(p.items['__proto__'].cnc,'2026-10-11');assert.equal(Object.hasOwn(Object.prototype,'cnc'),false);
});

test('a quoted Graphics line appears in Finish even without separate trade rows',()=>{
  const q=createBlankQuoteV27();q.lines[0].type='Graphics';q.lines[0].overrides.sqft=100;
  const item=itemTimelines(q)[0];assert.equal(item.stages.graphics,0);assert.equal(quotedStageHours([item]).graphics,0);
});

 test('schedule lists exclude service lines without losing project CAD hours or changing quote data',()=>{
  const q=fixture(),before=structuredClone(q),all=itemTimelines(q);
  assert.deepEqual(all.filter(isBuildTimelineItem).map(i=>i.name),['Golden Arch','Cabinet']);
  assert.equal(quotedStageHours(all).cad,12);
  for(const type of ['Fabrication','Graphics','beMatrix / SEG','Props / Resale'])assert.equal(isBuildTimelineItem({...all[0],type}),true);
  for(const type of ['Design / Engineering / CAD','Installer Days','Project Management Fee','Freight','Stage / Pack / Prep','Equipment Rental'])assert.equal(isBuildTimelineItem({...all[0],type}),false);
  assert.deepEqual(q,before);
});
