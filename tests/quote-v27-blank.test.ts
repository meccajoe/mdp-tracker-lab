import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlankQuoteV27 } from '../src/lib/quote-v27-template';
import { calculateQuoteV27 } from '../src/lib/quote-v27';
import { parseQuoteV27 } from '../src/lib/quote-v27-validation';

test('blank template has named rows, no project estimates or manual prices, and zero totals', () => {
  const quote=createBlankQuoteV27();
  assert.equal(quote.lines.length,37);
  assert.equal(quote.lines[0].name,'Item 1');
  assert.equal(quote.lines[14].name,'Item 15');
  assert.equal(quote.lines[22].name,'beMatrix walls');
  assert.equal(quote.lines.at(-1)?.name,'Freight');
  assert.equal(quote.catalog.length,699);
  assert.equal(quote.takeoffs.length,0);
  for (const line of quote.lines) {
    assert.equal(line.priceOverride,null);
    assert.deepEqual(line.overrides,{});
    assert.ok(Object.values(line.inputs).every(value=>value===0));
  }
  const result=calculateQuoteV27(parseQuoteV27(quote));
  assert.equal(result.totals.price,0);
  assert.equal(result.totals.buildBudget,0);
  assert.deepEqual(result.warnings,[]);
});

test('blank quote edit/save serialization restores calculation and auto PM fee without a Fonroche override', () => {
  const quote=createBlankQuoteV27();
  quote.lines[0].overrides.materials=100;
  quote.lines[0].overrides.hours=2;
  let result=calculateQuoteV27(parseQuoteV27(JSON.parse(JSON.stringify(quote))));
  assert.equal(result.lines[0].finalPrice,428/.905);
  assert.equal(result.lines.find(l=>l.type==='Project Management Fee')?.finalPrice,428/.905*.03/.955);
  quote.lines[0].priceOverride=0;
  result=calculateQuoteV27(quote);
  assert.equal(result.lines[0].calculatedPrice,428/.905);
  assert.equal(result.totals.price,0);
  quote.lines[0].priceOverride=null;
  assert.equal(calculateQuoteV27(quote).totals.price,428/.905+428/.905*.03/.955);
  assert.equal(calculateQuoteV27(createBlankQuoteV27()).totals.price,0);
});

test('blank template estimator links feed service rows and survive a saved snapshot', () => {
  const quote=createBlankQuoteV27();
  quote.estimators!.install.lead.installDays=1;
  const result=calculateQuoteV27(parseQuoteV27(JSON.parse(JSON.stringify(quote))));
  assert.equal(result.lines.find(l=>l.id==='line-28')?.finalPrice,1995/.905);
  assert.equal(result.lines.find(l=>l.id==='line-28')?.hoursAllowed,10);
  assert.deepEqual(result.warnings,[]);
});
