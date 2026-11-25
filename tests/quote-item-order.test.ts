import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlankQuoteV27} from '../src/lib/quote-v27-template';
import {calculateQuoteV27} from '../src/lib/quote-v27';
import {parseQuoteV27} from '../src/lib/quote-v27-validation';
import {moveQuoteItem} from '../src/lib/quote-item-actions';
import {newEditHistory,recordEdit,moveEditHistory} from '../src/lib/quote-edit-history';
test('moving items preserves all identities, links, pricing and persists through parsing and undo',()=>{
 const q=createBlankQuoteV27();q.lines[0].overrides={materials:1000,hours:10};q.lines[0].priceOverride=3456.78;
 const before=structuredClone(q),id=q.lines[0].id,results=calculateQuoteV27(q);
 moveQuoteItem(q,id,q.lines.length-1);
 assert.equal(q.lines.at(-1)?.id,id);
 assert.deepEqual({...q,lines:before.lines},before);
 assert.deepEqual([...q.lines].sort((a,b)=>a.id.localeCompare(b.id)),[...before.lines].sort((a,b)=>a.id.localeCompare(b.id)));
 const after=calculateQuoteV27(q);
 assert.deepEqual(after.lines.find(l=>l.id===id),results.lines.find(l=>l.id===id));
 assert.ok(Math.abs(after.totals.price-results.totals.price)<1e-8);
 assert.deepEqual(parseQuoteV27(JSON.parse(JSON.stringify(q))).lines.map(l=>l.id),q.lines.map(l=>l.id));
 const history=recordEdit(newEditHistory(before),q);assert.deepEqual(moveEditHistory(history,'undo').present,before);assert.deepEqual(moveEditHistory(moveEditHistory(history,'undo'),'redo').present,q);
 moveQuoteItem(q,id,0);assert.deepEqual(q,before);
 for(const position of [-1,q.lines.length,1.5])assert.throws(()=>moveQuoteItem(q,id,position));
 assert.throws(()=>moveQuoteItem(q,'missing',0));assert.deepEqual(q,before);
});

import {moveQuoteItemRelative} from '../src/lib/quote-item-actions';
test('drag insertion works before/after targets in either direction and self-drop is unchanged',()=>{
 for(const [source,target,after,expected] of [[0,2,false,[1,0,2,3]],[0,2,true,[1,2,0,3]],[3,1,false,[0,3,1,2]],[3,1,true,[0,1,3,2]],[0,3,true,[1,2,3,0]],[2,2,true,[0,1,2,3]]] as const){
  const q=createBlankQuoteV27();q.lines=q.lines.slice(0,4);const original=[...q.lines];
  moveQuoteItemRelative(q,original[source].id,original[target].id,after);
  assert.deepEqual(q.lines,expected.map(i=>original[i]));
 }
});
