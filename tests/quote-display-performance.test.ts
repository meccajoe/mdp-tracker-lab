import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlankQuoteV27} from '../src/lib/quote-v27-template';
import {calculateQuoteV27} from '../src/lib/quote-v27';
import {quoteBOM} from '../src/lib/quote-bom';
import {quoteMoney,quoteNumber} from '../src/lib/quote-format';
test('reused formatters preserve workbook currency and number output',()=>{
 for(const n of [0,-0,-1234.567,0.005,1234567.89]){
  assert.equal(quoteMoney(n),n.toLocaleString('en-US',{style:'currency',currency:'USD'}));
  assert.equal(quoteNumber(n),n.toLocaleString('en-US',{maximumFractionDigits:2}));
 }
});
test('BOM reuses computed takeoffs without changing combined or per-item budgets',()=>{
 const q=createBlankQuoteV27();
 q.takeoffs=Array.from({length:12},(_,i)=>({id:`bom-${i}`,lineId:q.lines[i%2].id,description:'Panel',materialId:null,tradeId:null,unit:i===11?'hours':'sheet',quantity:i+1,sections:2,unitCostOverride:i%2?20:30,hours:0,resale:false}));
 const before=JSON.stringify(q),calculation=calculateQuoteV27(q);
 assert.deepEqual(quoteBOM(q,calculation.takeoffs),quoteBOM(q));
 for(const line of q.lines)assert.deepEqual(quoteBOM(q,calculation.takeoffs.filter(r=>r.lineId===line.id)),quoteBOM({...q,takeoffs:q.takeoffs.filter(r=>r.lineId===line.id)}));
 assert.equal(JSON.stringify(q),before);
});
