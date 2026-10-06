import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseQuoteV27 } from '../src/lib/quote-v27-validation';
import { calculateQuoteV27 } from '../src/lib/quote-v27';
const fixture = JSON.parse(readFileSync('src/data/quote-v27-fonroche.json','utf8'));
test('request parsing retains workbook math and strips unrecognized fields',()=>{
  const result=parseQuoteV27({...fixture,untrustedExtra:'discard'});
  assert.equal(calculateQuoteV27(result).totals.price,28953.192);
  assert.equal('untrustedExtra' in result,false);
});
test('malformed HTTP document shapes and oversized fields are rejected',()=>{
  for(const value of [null,[],{}, {...fixture,lines:null},{...fixture,commission:'0.1'},{...fixture,assumptionsVersion:'x'.repeat(201)}]) assert.throws(()=>parseQuoteV27(value));
  const bad=structuredClone(fixture);bad.lines[0].priceOverride='100';assert.throws(()=>parseQuoteV27(bad));
  const missing=structuredClone(fixture);delete missing.settings.efficiency;assert.throws(()=>parseQuoteV27(missing));
});

test('daily hired crew persists, keeps aggregate billing and rejects mismatched totals',()=>{
 const quote=parseQuoteV27(fixture),support=quote.estimators!.install.support;
 const before=calculateQuoteV27(quote).estimators!.supportBilling;
 support.daily=Array.from({length:10},(_,i)=>({installDays:i===0?support.installDays:0,dismantleDays:i===0?support.dismantleDays:0,offDays:i===0?support.offDays:0}));
 const restored=parseQuoteV27(JSON.parse(JSON.stringify(quote)));
 assert.deepEqual(restored.estimators!.install.support.daily,support.daily);
 assert.equal(calculateQuoteV27(restored).estimators!.supportBilling,before);
 support.daily[1].installDays=2;
 assert.throws(()=>parseQuoteV27(quote),/totals disagree/);
 support.installDays+=2;
 assert.equal(calculateQuoteV27(parseQuoteV27(quote)).estimators!.supportBilling,before+2*quote.settings.supportDay);
});
