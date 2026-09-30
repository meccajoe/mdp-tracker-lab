import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlankQuoteV27 } from '../src/lib/quote-v27-template';
import { applyTakeoffCells } from '../src/lib/quote-takeoff-grid';
import { calculateQuoteV27 } from '../src/lib/quote-v27';
import { parseQuoteV27 } from '../src/lib/quote-v27-validation';
function fixture() {
  const q=createBlankQuoteV27();
  q.takeoffs=Array.from({length:3},(_,i)=>({id:`row-${i}`,lineId:q.lines[0].id,description:'Test',materialId:null,tradeId:null,quantity:0,sections:null,unitCostOverride:0,hours:0,resale:false}));
  return q;
}
test('paste and fill preserve row identity and resolve item names to stable IDs',()=>{
  const q=fixture(); const ids=q.takeoffs.map(r=>r.id);
  applyTakeoffCells(q,0,0,[[q.lines[1].name],[q.lines[1].name]]);
  assert.deepEqual(q.takeoffs.map(r=>r.id),ids);
  assert.equal(q.takeoffs[1].lineId,q.lines[1].id);
  applyTakeoffCells(q,0,3,[['2','$12.50','','3'],['4','0','0','1']]);
  const c=calculateQuoteV27(parseQuoteV27(q));
  assert.equal(c.takeoffs[0].cost,25);assert.equal(c.takeoffs[0].extendedHours,3);
  assert.equal(c.takeoffs[1].cost,0);assert.equal(c.takeoffs[1].extendedHours,0);
});
test('invalid bulk edits are atomic and cannot overwrite computed columns',()=>{
  const q=fixture();const before=structuredClone(q);
  assert.throws(()=>applyTakeoffCells(q,0,3,[['2'],['-1']]));
  assert.deepEqual(q,before);
  assert.throws(()=>applyTakeoffCells(q,0,9,[['12']]));
  assert.throws(()=>applyTakeoffCells(q,2,3,[['2'],['3']]));
  assert.throws(()=>applyTakeoffCells(q,0,0,[['Unknown item']]));
  assert.deepEqual(q,before);
});
test('catalog fill keeps catalog costs distinct from explicit zero and blank restoration',()=>{
  const q=fixture();const material=q.catalog.find(m=>m.unitCost>0)!;
  applyTakeoffCells(q,0,2,[[material.id],[material.id]]);
  assert.equal(q.takeoffs[0].unitCostOverride,null);
  applyTakeoffCells(q,0,3,[['2','0']]);
  assert.equal(calculateQuoteV27(q).takeoffs[0].cost,0);
  applyTakeoffCells(q,0,4,[['']]);
  assert.equal(calculateQuoteV27(q).takeoffs[0].cost,material.unitCost*2);
  assert.deepEqual(parseQuoteV27(JSON.parse(JSON.stringify(q))).takeoffs,q.takeoffs);
});
test('duplicate names require exact IDs and invalid resale is rejected',()=>{
  const q=fixture();q.lines[1].name=q.lines[0].name;
  assert.throws(()=>applyTakeoffCells(q,0,0,[[q.lines[0].name]]));
  applyTakeoffCells(q,0,0,[[q.lines[1].id]]);
  applyTakeoffCells(q,0,8,[['Yes'],['false']]);
  assert.equal(q.takeoffs[0].resale,true);assert.equal(q.takeoffs[1].resale,false);
  assert.throws(()=>applyTakeoffCells(q,0,8,[['perhaps']]));
});
