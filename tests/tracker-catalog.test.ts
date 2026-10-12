import test from 'node:test';import assert from 'node:assert/strict';
import {catalogMaterial,catalogInput,manualCatalogInput,exportCatalogCsv} from '../src/lib/tracker-catalog';
import {createBlankQuoteV27} from '../src/lib/quote-v27-template';
import {applySheetCells} from '../src/lib/quote-takeoff-grid';
import {calculateQuoteV27} from '../src/lib/quote-v27';
import {parseQuoteV27} from '../src/lib/quote-v27-validation';
test('catalog revisions are distinct snapshots; refresh and later selections preserve earlier prices',()=>{
 const first=catalogMaterial({item_id:'catalog-panel',revision:1,name:'Panel',unit:'sheet',unit_cost:20,source:'Google Sheet DB'}),next=catalogMaterial({...first,item_id:'catalog-panel',revision:2,unit_cost:50});
 assert.notEqual(first.id,next.id);const q=createBlankQuoteV27(),id=q.lines[0].id;
 applySheetCells(q,50,id,0,2,[['Panel','2']], [first as never]);applySheetCells(q,50,id,0,0,[[id]],null);
 assert.equal(calculateQuoteV27(q).lines[0].calculatedInputs.materials,40);
 applySheetCells(q,50,id,1,2,[['Panel','1']], [next as never]);applySheetCells(q,50,id,1,0,[[id]],null);
 assert.equal(calculateQuoteV27(parseQuoteV27(q)).lines[0].calculatedInputs.materials,90);
 assert.equal(q.catalog.find(m=>m.id===first.id)?.unitCost,20);
});
test('manual entries require explicit usable fields and export preserves source, quoting and safe text',()=>{
 assert.throws(()=>catalogInput({name:'Panel',unit:'',unitCost:0}));assert.throws(()=>catalogInput({name:'Panel',unit:'each',unitCost:null}));
 assert.equal(catalogInput({name:'Free labor',unit:'hours',unitCost:0}).unitCost,0);
 const q=createBlankQuoteV27();applySheetCells(q,50,q.lines[0].id,0,2,[['Custom panel','2','sheet','17']],null);
 assert.deepEqual(manualCatalogInput(q.takeoffs[0]),{name:'Custom panel',unit:'sheet',unitCost:17});
 const csv=exportCatalogCsv([catalogMaterial({item_id:'x',revision:1,name:'=Unsafe, "formula"',unit:'each',unit_cost:null,source:'Added from Takeoff'})]);
 assert.ok(csv.includes('"\'=Unsafe, ""formula"""'));assert.ok(csv.includes('"Added from Takeoff"'));assert.ok(csv.includes('"each",""'));
});
