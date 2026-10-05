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
 source.reusableItemIds=[source.lines[0].id];source.catalogUsage={[material.name]:4};
 const before=JSON.stringify(source),live=[{...material,id:'fresh-price',unitCost:21}];
 const id=insertReusableItem(target,parseQuoteV27(source),source.lines[0].id,live);
 assert.equal(JSON.stringify(source),before);assert.notEqual(id,source.lines[0].id);
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
