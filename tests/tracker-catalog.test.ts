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

import {findCatalogDuplicate,catalogNameKey} from '../src/lib/catalog-duplicates';
test('manual catalog additions match spelling and reviewed aliases while retaining meaningful differences',()=>{
 const entry=(name:string,unit='sheet',cost=45.41)=>catalogMaterial({item_id:name,revision:1,name,unit,unit_cost:cost,source:'Google Sheet DB'});
 const active=entry('MDF 3/4" 4x8'),old={...entry('3/4" MDF (4\'x8\')'),deletedAt:'2026-11-08'};
 assert.equal(findCatalogDuplicate({name:'¾” MDF (4′ x 8′)',unit:'sheets'},[old,active])?.itemId,active.itemId);
 assert.equal(findCatalogDuplicate({name:'Aluminum Sheet 48x96x.250',unit:'each'},[entry('Aluminum Sheet 4x8x0.25','each',536)])?.unitCost,536);
 for(const name of ['MDF 1/2" 4x8','MDF 3/4" 5x10','Maple Plywood 3/4" 4x8','MDF ULTRALIGHT 3/4" 4x8'])assert.equal(findCatalogDuplicate({name,unit:'sheet'},[active]),null);
 assert.equal(findCatalogDuplicate({name:active.name,unit:'sqft'},[active]),null);
 assert.equal(findCatalogDuplicate({name:active.name,unit:'sheet'},[old])?.deletedAt,old.deletedAt);
 assert.equal(catalogNameKey('MDF 0.750" 4x8'),catalogNameKey('3/4" MDF 4x8'));
 assert.notEqual(catalogNameKey('MDF 3/4" 4"x8"'),catalogNameKey('MDF 3/4" 4x8'));
 assert.equal(catalogNameKey('MDF 3/4" 48x96'),catalogNameKey('MDF 3/4" 4x8'));
 assert.notEqual(catalogNameKey('Maple B-2 3/4" 4x8'),catalogNameKey('Maple 2.75" 4x8'));
});

import {catalogPriceChanges} from '../src/lib/catalog-price-history';
test('price history shows true changes, preserves old units and leaves legacy sources unknown',()=>{
 const base={unit_cost:10,unit:'sheet',updated_at:'2026-11-08T10:00:00Z',source:'Google Sheet DB'};
 const rows=[{revision:1,document:base},{revision:2,document:{...base,unit_cost:20,price_change_source:{kind:'takeoff',workspace_id:'quote-id',quote_name:'Source quote'}}},{revision:3,document:{...base,unit_cost:20}},{revision:4,document:{...base,unit_cost:15,unit:'each',price_change_source:{kind:'catalog'}}}];
 const history=catalogPriceChanges(rows);
 assert.equal(history.length,3);assert.equal(history[0].oldCost,20);assert.equal(history[0].newCost,15);assert.equal(history[0].oldUnit,'sheet');assert.equal(history[0].unit,'each');
 assert.equal(history[1].source?.quote_name,'Source quote');assert.equal(history[1].oldCost,10);assert.equal(history[2].source,null);assert.equal(history[2].imported,true);
 assert.equal(catalogPriceChanges([{revision:1,document:{...base,unit_cost:null}},{revision:2,document:{...base,unit_cost:0}}])[0].newCost,0);
});
