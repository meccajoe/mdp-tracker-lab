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
