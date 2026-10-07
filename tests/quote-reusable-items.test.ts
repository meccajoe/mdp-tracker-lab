import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlankQuoteV27} from '../src/lib/quote-v27-template';
import {applySheetCells} from '../src/lib/quote-takeoff-grid';
import {insertReusableItem} from '../src/lib/quote-reusable-items';
import {parseQuoteV27} from '../src/lib/quote-v27-validation';
import {calculateQuoteV27} from '../src/lib/quote-v27';
test('reusable item uses current catalog, keeps source immutable and clones stable links',()=>{
 const source=createBlankQuoteV27(),target=createBlankQuoteV27();source.lines[0].name='Golden Arch';
 const material=source.catalog[0];applySheetCells(source,50,source.lines[0].id,0,2,[[material.name,'2']],null);
 applySheetCells(source,50,source.lines[0].id,0,0,[[source.lines[0].id]],null);
 source.reusableItemIds=[source.lines[0].id];source.catalogUsage={[material.name]:4};
 const before=JSON.stringify(source),live=[{...material,id:'fresh-price',unitCost:21}];
 const id=insertReusableItem(target,parseQuoteV27(source),source.lines[0].id,live);
 assert.equal(JSON.stringify(source),before);assert.equal(id,target.lines[0].id);assert.equal(target.lines.length,source.lines.length);assert.notEqual(target.takeoffs[0].id,source.takeoffs[0].id);
 assert.equal(target.takeoffs[0].materialId,'fresh-price');assert.equal(target.takeoffs[0].unitCostOverride,null);
 assert.equal(calculateQuoteV27(parseQuoteV27(target)).lines.find(line=>line.id===id)?.calculatedInputs.materials,42);
 assert.deepEqual(parseQuoteV27(source).catalogUsage,source.catalogUsage);
 const snapshot=JSON.stringify(target);assert.throws(()=>insertReusableItem(target,source,source.lines[0].id,[]));assert.equal(JSON.stringify(target),snapshot);
});
test('beMatrix linked wall includes rental and SEG; unlinked wall contributes nothing',()=>{
 const q=createBlankQuoteV27();q.commission=0;
 const line=q.lines.find(line=>line.type==='beMatrix / SEG')!;
 q.estimators!.beMatrix.walls=[{id:'wall',lineId:line.id,width:22,height:10,sides:2,sqftOverride:null}];
 const value=calculateQuoteV27(q).lines.find(row=>row.id===line.id)!;
 assert.equal(value.calculatedInputs.sqft,440);assert.equal(value.calculatedInputs.rental,3500);
 assert.equal(value.finalPrice,3500+440*q.settings.graphicsSell);
 q.estimators!.beMatrix.walls[0].lineId=null;
 assert.equal(calculateQuoteV27(q).lines.find(row=>row.id===line.id)!.finalPrice,0);
});

import {prequoteSnapshot} from '../src/lib/quote-prequote';
import {takeoffWorksheetRows} from '../src/lib/quote-takeoff-grid';
test('independent library snapshots exclude other items and preserve service calculations',()=>{
 const q=createBlankQuoteV27();q.lines[0].name='Cabinet';q.schedule={buildStart:'2026-10-06',buildFinish:'2026-10-08',installDate:'',status:'Possible'};
 const wallLine=q.lines.find(line=>line.type==='beMatrix / SEG')!;
 q.estimators!.beMatrix.walls=[{id:'wall',lineId:wallLine.id,width:22,height:10,sides:2,sqftOverride:null}];
 q.estimators!.install.lead.installDays=5;
 const before=JSON.stringify(q),saved=parseQuoteV27(prequoteSnapshot(q,wallLine.id));
 assert.equal(saved.lines.length,1);assert.equal(saved.schedule,undefined);assert.equal(saved.estimators!.install.lead.installDays,0);
 assert.equal(calculateQuoteV27(saved).lines[0].finalPrice,calculateQuoteV27(q).lines.find(line=>line.id===wallLine.id)!.finalPrice);
 assert.equal(JSON.stringify(q),before);
});
test('insertion fills empty item/rows and never shifts over or replaces populated rows',()=>{
 const source=createBlankQuoteV27();source.lines[0].name='Cabinet';
 applySheetCells(source,50,'',0,0,[[source.lines[0].id,'Cabinet','Custom wood','3']],null);
 const q=createBlankQuoteV27();q.lines[0].name='Already used';
 q.takeoffs=takeoffWorksheetRows(q,50,'');q.takeoffs[0].notes='Keep first';q.takeoffs[4].notes='Keep fifth';
 const originalRows=structuredClone(q.takeoffs);const id=insertReusableItem(q,source,source.lines[0].id,[]);
 assert.equal(id,q.lines[1].id);assert.equal(q.takeoffs.length,50);assert.deepEqual(q.takeoffs[0],originalRows[0]);assert.deepEqual(q.takeoffs[4],originalRows[4]);
 assert.equal(q.takeoffs[1].lineId,id);assert.equal(q.takeoffs[1].quantity,3);assert.doesNotThrow(()=>parseQuoteV27(q));
});

import {clearQuoteItem} from '../src/lib/quote-item-actions';
import {newEditHistory,recordEdit,moveEditHistory} from '../src/lib/quote-edit-history';
test('clearing an item resets its slot, removes its rows/links, preserves other items and can be undone',()=>{
 const q=createBlankQuoteV27();const item=q.lines[0];item.name='Cabinet';item.overrides.materials=250;item.priceOverride=700;
 applySheetCells(q,50,'',0,0,[[item.id,'Cabinet','Custom wood','3']],null);
 const other=q.lines[1];other.name='Arch';applySheetCells(q,50,'',1,0,[[other.id,'Arch','Custom metal','2']],null);
 const before=structuredClone(q),next=structuredClone(q);clearQuoteItem(next,item.id);
 assert.equal(next.lines.length,before.lines.length);assert.equal(next.lines[0].id,item.id);assert.equal(next.lines[0].name,'Item 1');
 assert.equal(calculateQuoteV27(parseQuoteV27(next)).lines[0].finalPrice,0);assert.equal(next.takeoffs.length,1);assert.deepEqual(next.takeoffs[0],before.takeoffs[1]);assert.deepEqual(next.lines[1],before.lines[1]);
 const restored=moveEditHistory(recordEdit(newEditHistory(before),next),'undo');assert.deepEqual(restored.present,before);
 const frame=next.lines.find(line=>line.type==='beMatrix / SEG')!;next.estimators!.beMatrix.walls=[{id:'test',lineId:frame.id,width:10,height:8,sides:1,sqftOverride:null}];clearQuoteItem(next,frame.id);assert.equal(next.estimators!.beMatrix.walls.length,0);assert.doesNotThrow(()=>parseQuoteV27(next));
 const installer=next.estimators!.install.lead.lineId!;clearQuoteItem(next,installer);assert.equal(next.estimators!.install.lead.lineId,null);assert.doesNotThrow(()=>parseQuoteV27(next));
});
