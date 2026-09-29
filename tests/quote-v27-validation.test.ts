import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseQuoteV27 } from '../src/lib/quote-v27-validation.ts';
import { calculateQuoteV27 } from '../src/lib/quote-v27.ts';
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
