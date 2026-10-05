import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCatalogCsv,fetchLiveCatalog,MATERIALS_CSV_URL} from '../src/lib/quote-live-catalog';
import {applySheetCells} from '../src/lib/quote-takeoff-grid';
import {createBlankQuoteV27} from '../src/lib/quote-v27-template';
import {parseQuoteV27} from '../src/lib/quote-v27-validation';
import {calculateQuoteV27} from '../src/lib/quote-v27';
const csv=(rows:string)=>'Title\nInstructions\n\nDescription,Unit,Unit cost $,Type\n'+rows;
test('live parser reads quoted descriptions and prices; incomplete and duplicate entries are excluded',()=>{
  const result=parseCatalogCsv(csv('"Panel, 4""",sheet,"$1,200.50",Material\nCarpentry,hours,,Labor\nIncomplete,each,,Material\nDuplicate,each,2,Material\nDuplicate,each,3,Material'));
  assert.equal(result.materials.length,2);assert.equal(result.materials[0].name,'Panel, 4"');
  assert.equal(result.materials[0].unitCost,1200.5);assert.equal(result.materials[1].unitCost,0);
  assert.equal(result.warnings.length,2);
  assert.throws(()=>parseCatalogCsv('<html>Sign in</html>'));
  assert.throws(()=>parseCatalogCsv(csv('"unfinished')));
});
test('refresh always fetches the exact read-only source without cache and sees additions',async()=>{
  let calls=0;
  const fake=async(url:unknown,options?:RequestInit)=>{
    assert.equal(url,MATERIALS_CSV_URL);assert.equal(options?.cache,'no-store');
    calls++;return new Response(csv('Panel,each,10,Material'+(calls>1?'\nNew material,each,12,Material':'')));
  };
  assert.equal((await fetchLiveCatalog(fake as typeof fetch)).materials.length,1);
  assert.equal((await fetchLiveCatalog(fake as typeof fetch)).materials.length,2);
  await assert.rejects(fetchLiveCatalog((async()=>new Response('',{status:403})) as typeof fetch));
});
test('live selections auto-fill cost and units without repricing old rows or losing overrides',()=>{
  const q=createBlankQuoteV27();const old=parseCatalogCsv(csv('Panel,sheet,10,Material')).materials;
  applySheetCells(q,50,q.lines[0].id,0,2,[['Panel','2']],old);
  const oldSnapshot=structuredClone(q);
  const latest=parseCatalogCsv(csv('Panel,sheet,20,Material\nAdded,each,5,Material')).materials;
  assert.notEqual(old[0].id,latest[0].id);
  applySheetCells(q,50,q.lines[0].id,1,2,[['Panel','3']],latest);
  let c=calculateQuoteV27(q);assert.equal(c.takeoffs[0].cost,20);assert.equal(c.takeoffs[1].cost,60);
  applySheetCells(q,50,q.lines[0].id,0,5,[['0']],latest);
  assert.equal(calculateQuoteV27(q).takeoffs[0].cost,0);
  applySheetCells(q,50,q.lines[0].id,0,5,[['']],latest);
  assert.equal(calculateQuoteV27(q).takeoffs[0].cost,20);
  applySheetCells(q,50,q.lines[0].id,0,2,[['Panel']],latest);
  assert.equal(calculateQuoteV27(q).takeoffs[0].cost,40);
  assert.equal(calculateQuoteV27(oldSnapshot).takeoffs[0].cost,20);
  applySheetCells(q,50,q.lines[0].id,0,11,[['Shop note']],latest);
  applySheetCells(q,50,q.lines[0].id,0,4,[['lot']],latest);
  const reopened=parseQuoteV27(JSON.parse(JSON.stringify(q)));
  assert.equal(reopened.takeoffs[0].notes,'Shop note');assert.equal(reopened.takeoffs[0].unit,'lot');
});
test('custom descriptions, protected totals, and failed paste preserve original snapshots',()=>{
  const q=createBlankQuoteV27();const live=parseCatalogCsv(csv('Panel,sheet,10,Material')).materials;
  applySheetCells(q,50,q.lines[0].id,0,2,[['Custom panel','2','lot','5']],live);
  assert.equal(calculateQuoteV27(q).takeoffs[0].cost,10);
  const before=structuredClone(q);
  assert.throws(()=>applySheetCells(q,50,q.lines[0].id,0,2,[['Panel','-1']],live));
  assert.deepEqual(q,before);
  assert.throws(()=>applySheetCells(q,50,q.lines[0].id,0,8,[['123']],live));
  assert.deepEqual(q,before);
});
