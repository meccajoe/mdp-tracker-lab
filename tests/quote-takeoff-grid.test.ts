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

import { takeoffWorksheetRows, applyWorksheetCells } from '../src/lib/quote-takeoff-grid';
test('opening a blank worksheet provides 50 rows without changing the document',()=>{
  const q=createBlankQuoteV27();const original=structuredClone(q);
  assert.equal(takeoffWorksheetRows(q,50,q.lines[0].id).length,50);
  assert.deepEqual(q,original);
});
test('typing in row 50 preserves row position, existing rows, and valid saved totals',()=>{
  const q=fixture(); const original=structuredClone(q.takeoffs);
  applyWorksheetCells(q,50,q.lines[1].id,49,1,[['Panel']]);
  assert.equal(q.takeoffs.length,50);
  assert.deepEqual(q.takeoffs.slice(0,3),original);
  assert.equal(q.takeoffs[49].description,'Panel');
  assert.equal(q.takeoffs[49].lineId,q.lines[1].id);
  assert.equal(calculateQuoteV27(parseQuoteV27(JSON.parse(JSON.stringify(q)))).totals.price,0);
  applyWorksheetCells(q,100,q.lines[1].id,50,3,[['2','10']]);
  assert.equal(q.takeoffs.length,51);
  assert.equal(calculateQuoteV27(q).takeoffs[50].cost,20);
  assert.equal(new Set(q.takeoffs.map(r=>r.id)).size,51);
});
test('paste into fresh rows is atomic and respects visible capacity',()=>{
  const q=createBlankQuoteV27();const original=structuredClone(q);
  assert.throws(()=>applyWorksheetCells(q,50,q.lines[0].id,49,3,[['2'],['3']]));
  assert.throws(()=>applyWorksheetCells(q,50,q.lines[0].id,0,3,[['2'],['-1']]));
  assert.deepEqual(q,original);
  applyWorksheetCells(q,50,q.lines[0].id,0,3,[['2','10'],['3','20']]);
  assert.equal(calculateQuoteV27(q).takeoffs[1].cost,60);
});

import {applySheetCells,SHEET_COLUMNS,quoteItemLabel} from '../src/lib/quote-takeoff-grid';
test('assign fresh and existing rows independently; names propagate through saved item identity',()=>{
  const q=createBlankQuoteV27();const col=(key:typeof SHEET_COLUMNS[number])=>SHEET_COLUMNS.indexOf(key);
  applySheetCells(q,50,q.lines[0].id,6,0,[['Item 2']],null);
  applySheetCells(q,50,q.lines[0].id,7,0,[['Item 2']],null);
  assert.equal(q.takeoffs[6].lineId,q.lines[1].id);assert.equal(q.takeoffs[7].lineId,q.lines[1].id);
  applySheetCells(q,50,q.lines[0].id,7,col('itemName'),[['Golden Arch']],null);
  applySheetCells(q,50,q.lines[0].id,6,col('description'),[['Custom panel','2','each','10']],null);
  applySheetCells(q,50,q.lines[0].id,7,col('hours'),[['3']],null);
  const saved=parseQuoteV27(JSON.parse(JSON.stringify(q)));
  assert.equal(quoteItemLabel(saved,saved.takeoffs[6].lineId),'Item 2');
  const result=calculateQuoteV27(saved).lines.find(line=>line.id===q.lines[1].id)!;
  assert.equal(result.name,'Golden Arch');assert.equal(result.calculatedInputs.materials,20);assert.equal(result.calculatedInputs.hours,3);
  const before=structuredClone(saved);
  assert.throws(()=>applySheetCells(saved,50,saved.lines[0].id,6,col('itemName'),[['Item 1']],null));
  assert.deepEqual(saved,before);
  applySheetCells(saved,50,saved.lines[0].id,6,0,[['Item 1']],null);
  assert.equal(saved.takeoffs[7].lineId,saved.lines[1].id);
  assert.equal(saved.lines[1].name,'Golden Arch');
});
