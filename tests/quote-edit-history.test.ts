import test from 'node:test';
import assert from 'node:assert/strict';
import {newEditHistory,recordEdit,moveEditHistory} from '../src/lib/quote-edit-history';
import {createBlankQuoteV27} from '../src/lib/quote-v27-template';
test('five mixed workbook changes undo and redo in exact order without mutating snapshots',()=>{
  const original=createBlankQuoteV27();let h=newEditHistory(original);const states=[original];
  const changes=[(q:typeof original)=>{q.lines[0].name='Wall';},(q:typeof original)=>{q.lines[0].priceOverride=0;},(q:typeof original)=>{q.lines[0].overrides.hours=12;},(q:typeof original)=>{q.catalog[0].unitCost=125;},(q:typeof original)=>{q.lines[1].name='Door';}];
  for(const change of changes){const q=structuredClone(h.present);change(q);h=recordEdit(h,q);states.push(q);}
  for(let i=4;i>=0;i--){h=moveEditHistory(h,'undo');assert.deepEqual(h.present,states[i]);}
  assert.equal(h.past.length,0);assert.equal(h.future.length,5);
  for(let i=1;i<=5;i++){h=moveEditHistory(h,'redo');assert.deepEqual(h.present,states[i]);}
  assert.equal(h.future.length,0);assert.equal(original.lines[0].name,'Item 1');
});
test('typing a field is one step; a fresh edit clears redo but a no-op does not',()=>{
  const group={};let h=newEditHistory({name:''});
  for(const name of ['W','Wa','Wall'])h=recordEdit(h,{name},group);
  assert.equal(h.past.length,1);h=moveEditHistory(h,'undo');assert.equal(h.present.name,'');
  assert.equal(recordEdit(h,{name:''}),h);
  h=recordEdit(h,{name:'Door'},{});assert.equal(h.future.length,0);
  assert.equal(moveEditHistory(h,'redo'),h);
});
test('history resets explicitly and retains the latest 100 actions',()=>{
  let h=newEditHistory(0);for(let i=1;i<=105;i++)h=recordEdit(h,i);
  assert.equal(h.past.length,100);for(let i=0;i<100;i++)h=moveEditHistory(h,'undo');
  assert.equal(h.present,5);assert.equal(moveEditHistory(h,'undo'),h);
  h=newEditHistory(h.present);assert.equal(h.future.length,0);assert.equal(h.past.length,0);
});
