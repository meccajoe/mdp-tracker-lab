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

import {catalogDuplicatePlan,reviewedCatalogGroups,catalogUsageCount} from '../src/lib/catalog-review';
import {catalogDimensions,compareCatalogChoices} from '../src/lib/catalog-sort';
test('reviewed equivalents retain highest cost without merging species, grades, units or incomplete prices',()=>{
 const make=(name:string,cost:number|null,unit='sheet')=>catalogMaterial({item_id:name,revision:1,name,unit,unit_cost:cost,source:'Google Sheet DB'});
 const aliases=reviewedCatalogGroups[0];
 const entries=[make(aliases[0],20),make(aliases[1],50),make('1" Birch Plywood 4x8',80),make('1" Maple Plywood 4x8',90)];
 const before=JSON.stringify(entries),plan=catalogDuplicatePlan(entries);
 assert.equal(plan.length,1);assert.equal(plan[0].keep.unitCost,50);assert.equal(plan[0].archive.length,1);assert.equal(JSON.stringify(entries),before);
 assert.equal(catalogDuplicatePlan([make(aliases[0],20),make(aliases[1],50,'each')]).length,0);
 assert.equal(catalogDuplicatePlan([make(aliases[0],null),make(aliases[1],50)]).length,0);
 assert.equal(catalogDuplicatePlan([{...entries[0],deletedAt:'2026-11-08'},entries[1]]).length,0);
 assert.equal(catalogUsageCount(aliases[1],{[aliases[0]]:8,[aliases[1]]:2}),10);
});
test('catalog ranking preserves usage then compares fractions, footprint sizes and metal thickness',()=>{
 const names=['3/4" Maple Plywood 4x8','1/2" Birch Plywood 4x8','1/4" Plywood 5x10','1/4" Plywood 4x8'];
 const sorted=names.map(name=>({name})).sort(compareCatalogChoices).map(m=>m.name);
 assert.deepEqual(sorted,[names[3],names[2],names[1],names[0]]);
 assert.equal([...names].map(name=>({name})).sort((a,b)=>compareCatalogChoices(a,b,{[names[0]]:3}))[0].name,names[0]);
 assert.deepEqual(catalogDimensions('¾” MDF (4′x8′)'),[.75,48,96]);
 assert.deepEqual(catalogDimensions('Aluminum Sheet 4x8x.25'),[.25,48,96]);
 assert.deepEqual(catalogDimensions('Aluminum Sheet 48x96x.250'),[.25,48,96]);
 assert.ok(compareCatalogChoices({name:'Aluminum Sheet 4x8x.125'},{name:'Aluminum Sheet 4x8x.25'})<0);
 assert.ok(compareCatalogChoices({name:'Steel Sheet 4x8x18ga'},{name:'Steel Sheet 4x8x16ga'})<0);
 assert.deepEqual(catalogDimensions('Maple Plywood B-2 3/4" 4x8'),[.75,48,96]);
 assert.deepEqual(catalogDimensions('Bending Plywood 0.175" 8x4'),[.175,48,96]);
 assert.deepEqual(catalogDimensions('1-1/2" plywood 4x8'),[1.5,48,96]);
});
