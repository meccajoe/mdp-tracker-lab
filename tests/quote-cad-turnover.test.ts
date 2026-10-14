import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {createBlankQuoteV27} from '../src/lib/quote-v27-template';
import {buildCadTurnover} from '../src/lib/quote-cad-turnover';
import {renderCadTurnoverPdf} from '../src/lib/quote-cad-pdf';
import {cadFixture} from './fixtures/cad-turnover';

test('CAD uses saved quantities, section multipliers and trade hours without altering the quote',()=>{
  const quote=cadFixture(),before=JSON.stringify(quote);
  const report=buildCadTurnover(quote,meta);
  const arch=report.items.find(i=>i.name==='Golden Arch')!;
  assert.equal(arch.materials[0].quantity,14);
  assert.equal(arch.materials[0].description,'¾” plywood');
  assert.match(arch.summary,/40 hours of Carpentry/);
  assert.equal(arch.materials[2].notes,'Paint finish; color to be confirmed.');
  const wall=report.items.find(i=>i.name==='Left Wall')!;
  assert.ok(wall.instructions.some(s=>s.includes('7 estimated frames')&&s.includes('on both sides')));
  assert.ok(wall.warnings.some(s=>s.includes('not a frame-size')));
  assert.equal(JSON.stringify(quote),before);
});
test('CAD exposes overrides, orphan rows, absent BOM and unknown trade without inventing scope',()=>{
  const quote=cadFixture();
  quote.takeoffs[3].tradeId=null;quote.lines[0].overrides.hours=20;
  quote.takeoffs.push({...quote.takeoffs[0],id:'orphan',lineId:'',quantity:100});
  quote.lines[2].takeoffDriven=false;quote.lines[2].inputs.materials=1000;
  quote.lines[2].name='Allowance only';quote.takeoffs=quote.takeoffs.filter(r=>r.lineId!==quote.lines[2].id);
  quote.importNotes=['Detailed source estimator was not reconstructed.'];
  const report=buildCadTurnover(quote,meta),arch=report.items[0];
  assert.ok(report.warnings.some(s=>s.includes('Unassigned')));
  assert.ok(report.warnings.includes(quote.importNotes[0]));
  assert.ok(arch.labor.some(s=>s.includes('trade not assigned')));
  assert.ok(arch.warnings.some(s=>s.includes('Manual quote input overrides: hours')));
  assert.ok(arch.warnings.some(s=>s.includes('differs')));
  assert.equal(arch.materials[0].quantity,14);
  assert.ok(report.items.find(i=>i.name==='Allowance only')!.warnings.some(s=>s.includes('no itemized')));
});
test('CAD preserves zero multipliers and legacy beMatrix does not invent graphic sides',()=>{
  const quote=cadFixture();quote.takeoffs[0].sections=0;delete quote.estimators;
  quote.lines[1].inputs.panels=7;quote.lines[1].inputs.sqft=364;
  const report=buildCadTurnover(quote,meta);
  assert.equal(report.items[0].materials.some(m=>m.description==='¾” plywood'),false);
  assert.ok(report.items[1].warnings.some(s=>s.includes('SEG sides were not saved')));
  assert.equal(report.items[1].instructions.some(s=>s.includes('both sides')),false);
});
test('empty quote produces explicit missing-scope message; PDF is paginated and supports long names/notes',async()=>{
  const blank=buildCadTurnover(createBlankQuoteV27(),meta);assert.equal(blank.items.length,0);
  const quote=cadFixture();quote.lines[0].name='Golden Arch '.repeat(40);quote.takeoffs[0].notes='Confirm finish and dimensions. '.repeat(300);
  const pdf=await renderCadTurnoverPdf(buildCadTurnover(quote,meta));
  const loaded=await PDFDocument.load(pdf);assert.ok(loaded.getPageCount()>2);assert.ok(loaded.getPageCount()<30);
  assert.match(loaded.getTitle()!,/CAD Turnover/);
});
export const meta={project:'CAD sample - not a live quote',client:'Example Client',workspaceId:'00000000-0000-4000-8000-000000000001',revision:7,generatedAt:'2026-10-11T18:00:00Z'};

test('CAD includes an aggregated BOM plus per-item detail, excludes empty worksheet rows',()=>{
 const q=cadFixture();q.takeoffs.push({...q.takeoffs[0],id:'more-plywood',lineId:q.lines[2].id,quantity:3,sections:1});
 q.takeoffs.push({...q.takeoffs[0],id:'blank',lineId:'',description:'Untitled takeoff',quantity:0,sections:null});
 const report=buildCadTurnover(q,meta);
 assert.equal(report.bom.find(m=>m.description==='¾” plywood')?.quantity,17);
 assert.equal(report.items[0].materials[0].quantity,14);
 assert.equal(report.warnings.some(w=>w.includes('Unassigned')),false);
});
