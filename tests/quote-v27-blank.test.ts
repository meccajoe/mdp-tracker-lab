import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlankQuoteV27 } from '../src/lib/quote-v27-template';
import { calculateQuoteV27 } from '../src/lib/quote-v27';
import { parseQuoteV27 } from '../src/lib/quote-v27-validation';

test('blank template has named rows, no project estimates or manual prices, and zero totals', () => {
  const quote=createBlankQuoteV27();
  assert.equal(quote.lines.length,36);
  assert.equal(quote.lines[0].name,'Item 1');
  assert.equal(quote.lines[14].name,'Item 15');
  assert.ok(!quote.lines.some(line=>line.type==='beMatrix / SEG'));
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
  assert.equal(result.lines[0].finalPrice,473);
  assert.equal(result.lines.find(l=>l.type==='Project Management Fee')?.finalPrice,15);
  quote.lines[0].priceOverride=0;
  result=calculateQuoteV27(quote);
  assert.equal(result.lines[0].calculatedPrice,473);
  assert.equal(result.totals.price,0);
  quote.lines[0].priceOverride=null;
  assert.equal(calculateQuoteV27(quote).totals.price,488);
  assert.equal(calculateQuoteV27(createBlankQuoteV27()).totals.price,0);
});

test('blank template estimator links feed service rows and survive a saved snapshot', () => {
  const quote=createBlankQuoteV27();
  quote.estimators!.install.lead.installDays=1;
  const result=calculateQuoteV27(parseQuoteV27(JSON.parse(JSON.stringify(quote))));
  assert.equal(result.lines.find(l=>l.id==='line-28')?.finalPrice,2100);
  assert.equal(result.lines.find(l=>l.id==='line-28')?.hoursAllowed,10);
  assert.deepEqual(result.warnings,[]);
});

import {builderItemName,showBuilderLine} from '../src/lib/quote-builder-display';
import {parseSchedule} from '../src/lib/quote-schedule';
test('spares become regular item names; inactive linked installers hide without losing entered data',()=>{
 const q=createBlankQuoteV27();assert.equal(q.lines[15].name,'Item 16');assert.equal(q.lines[21].name,'Item 22');assert.ok(!q.lines.some(l=>/^Spare /.test(l.name)));
 const legacy={...q.lines[15],name:'Spare 1'};assert.equal(builderItemName(legacy,15),'Item 16');assert.equal(legacy.name,'Spare 1');
 const second=q.lines.find(l=>l.id===q.estimators!.install.second.lineId)!;
 assert.equal(showBuilderLine(q,second),false);q.estimators!.install.second.installDays=1;assert.equal(showBuilderLine(q,second),true);
 q.estimators!.install.second.installDays=0;second.priceOverride=0;assert.equal(showBuilderLine(q,second),true);
 second.priceOverride=null;second.overrides.cost=25;assert.equal(showBuilderLine(q,second),true);
 delete second.overrides.cost;q.estimators!.travel.people.second.traveling=true;assert.equal(showBuilderLine(q,second),true);
 const before=JSON.stringify(q);showBuilderLine(q,second);assert.equal(JSON.stringify(q),before);
});
test('dismantle date round trips without making older quotes invalid',()=>{
 const base={buildStart:'',buildFinish:'',installDate:'',status:''};assert.equal(parseSchedule(base).dismantleDate,undefined);
 assert.equal(parseSchedule({...base,dismantleDate:'2026-11-30'}).dismantleDate,'2026-11-30');
 assert.throws(()=>parseSchedule({...base,dismantleDate:'2026-02-30'}));
});
