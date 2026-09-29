import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateQuoteV27, EMPTY_INPUTS, LINE_TYPES } from '../src/lib/quote-v27.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/quote-v27/fonroche.json', import.meta.url)));
const fresh = () => structuredClone(fixture.quote);
const close = (actual, expected, label = '') => assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} != ${expected}`);
const line = (result, id) => result.lines.find(row => row.id === id);

test('all 18 Fonroche lines reproduce independent workbook cached outputs', () => {
  const result = calculateQuoteV27(fresh());
  for (const expected of fixture.expected.lines) {
    for (const [key, value] of Object.entries(expected)) if (key !== 'id') close(line(result, expected.id)[key], value, `${expected.id}.${key}`);
  }
  close(result.totals.price, 28953.192);
  close(result.totals.buildBudget, 11890.64);
  close(result.laborRate, 39.27);
  close(result.totals.hoursAllowed, 112);
  close(result.tradeHours['trade-66'], 44);
  close(result.tradeHours['trade-67'], 12);
  close(result.tradeHours['trade-73'], 4);
  close(line(result, 'line-28').hoursAllowed, 40);
  close(line(result, 'line-35').hoursAllowed, 12);
  assert.deepEqual(result.warnings, []);
});

test('quantity and section changes update material budget and sell price', () => {
  const quote = fresh();
  const plywood = quote.takeoffs.find(row => row.id === 'takeoff-8');
  plywood.quantity = 5;
  plywood.sections = 2;
  const result = calculateQuoteV27(quote);
  close(result.totals.price, 28953.192 + 450 * 2.08);
  close(result.totals.buildBudget, 11890.64 + 450);
  plywood.sections = 0;
  close(calculateQuoteV27(quote).totals.buildBudget, 11890.64 - 300);
});

test('catalog costs, explicit zero overrides, and restoration remain distinct', () => {
  const quote = fresh();
  const row = quote.takeoffs.find(row => row.id === 'takeoff-8');
  quote.catalog.find(material => material.id === row.materialId).unitCost = 80;
  close(line(calculateQuoteV27(quote), 'line-6').materialsBudget, 812.4);
  row.unitCostOverride = 0;
  close(line(calculateQuoteV27(quote), 'line-6').materialsBudget, 492.4);
  row.unitCostOverride = null;
  close(line(calculateQuoteV27(quote), 'line-6').materialsBudget, 812.4);
});

test('stable IDs keep takeoffs attached after line, material, and trade renames', () => {
  const quote = fresh();
  quote.lines[1].name = 'Renamed platform';
  quote.catalog.forEach(material => { material.name = 'New catalog label'; });
  quote.trades.forEach(trade => { trade.name = 'New trade label'; });
  close(calculateQuoteV27(quote).totals.price, 28953.192);
  close(calculateQuoteV27(quote).tradeHours['trade-66'], 44);
});

test('trade labor edits change sell, budget, and handoff together', () => {
  const quote = fresh();
  const row = quote.takeoffs.find(row => row.id === 'takeoff-14');
  row.hours = 22;
  row.sections = 2;
  const result = calculateQuoteV27(quote);
  close(result.totals.price, 28953.192 + 24 * 110);
  close(result.totals.buildBudget, 11890.64 + 24 * 39.27);
  close(result.tradeHours['trade-66'], 68);
});

test('price overrides preserve calculations and do not change production budgets', () => {
  const quote = fresh();
  quote.lines.find(row => row.id === 'line-6').priceOverride = 0;
  let result = calculateQuoteV27(quote);
  close(line(result, 'line-6').finalPrice, 0);
  close(line(result, 'line-6').calculatedPrice, 4948.192);
  close(result.totals.buildBudget, 11890.64);
  quote.lines.find(row => row.id === 'line-6').priceOverride = null;
  close(calculateQuoteV27(quote).totals.price, 28953.192);
});

test('PM literal is an explicit override; restored formula follows final hard scope only', () => {
  const quote = fresh();
  const pm = quote.lines.find(row => row.type === 'Project Management Fee');
  const original = calculateQuoteV27(quote);
  close(line(original, pm.id).calculatedPrice, 647.49576);
  close(line(original, pm.id).finalPrice, 1250);
  pm.priceOverride = null;
  quote.lines.find(row => row.id === 'line-6').priceOverride = 4000;
  quote.lines.find(row => row.id === 'line-32').priceOverride = 9000;
  const result = calculateQuoteV27(quote);
  close(line(result, pm.id).finalPrice, (647.49576 / 0.03 - 948.192) * 0.03);
});

test('commission grosses up calculated prices once and records payout', () => {
  const quote = fresh();
  quote.commission = 0.1;
  quote.lines.find(row => row.type === 'Project Management Fee').priceOverride = null;
  const result = calculateQuoteV27(quote);
  close(line(result, 'line-6').calculatedPrice, 4948.192 / 0.9);
  close(line(result, 'line-36').calculatedPrice, 647.49576 / 0.9);
  close(result.totals.commission, result.totals.price * 0.1);
  close(result.totals.margin, result.totals.price - result.totals.buildBudget - result.totals.contingency - result.totals.indirect - result.totals.commission);
});

test('efficiency changes allowed hours without silently changing quoted trade demand', () => {
  const quote = fresh();
  quote.settings.efficiency = 2;
  const result = calculateQuoteV27(quote);
  close(line(result, 'line-6').hoursAllowed, 15);
  close(result.tradeHours['trade-66'], 44);
  close(line(result, 'line-6').overallocatedTradeHours, 15);
  assert.equal(result.warnings.length, 2);
  close(result.totals.price, 28953.192);
});

test('days bypass efficiency and hours overrides can be restored', () => {
  const quote = fresh();
  quote.settings.efficiency = 2;
  const platform = quote.lines.find(row => row.id === 'line-6');
  platform.overrides.hours = 0;
  platform.inputs.days = 3;
  close(line(calculateQuoteV27(quote), platform.id).hoursAllowed, 24);
  platform.overrides.hours = null;
  close(line(calculateQuoteV27(quote), platform.id).hoursAllowed, 15);
});

test('all pricing branches have numeric expectations independent of implementation', () => {
  // [type, input overrides, sell, material budget, allowed hours]
  const cases = [
    ['Fabrication', {materials:100,resale:10,hours:2}, 444,110,2],
    ['Graphics', {sqft:10,hours:2}, 470,65,2],
    ['beMatrix / SEG', {sqft:10,panels:12,rental:300}, 550,65,5],
    ['Design / Engineering / CAD', {hours:2}, 250,0,2],
    ['Lead Installer — Install', {siteDays:2}, 3990,0,20],
    ['Lead Installer — Dismantle', {siteDays:2}, 3990,0,20],
    ['Off Days — Lead', {siteDays:2}, 1995,0,20],
    ['Off Days — Support', {siteDays:2}, 1495,0,20],
    ['Install Support Labor', {siteDays:2,cost:2990}, 2990,1500,0],
    ['Travel — Lead Installer', {travelDays:2}, 1995,0,20],
    ['Travel — Project Manager', {travelDays:2}, 1495,0,20],
    ['Travel — Install Support', {travelDays:2}, 1495,0,20],
    ['Stage / Pack / Prep', {hours:2}, 220,0,2],
    ['Disposal', {hours:2,cost:100}, 320,100,2],
    ['Equipment Rental', {cost:100}, 160,100,0],
    ['Props / Resale', {materials:100,resale:50,cost:50}, 320,200,0],
    ['Travel & Expenses', {cost:100}, 160,100,0],
    ['Freight', {cost:100}, 160,100,0],
    ['Installer Days', {siteDays:4,cost:5985}, 5985,0,40],
    ['Project Management Fee', {}, 0,0,0],
  ];
  assert.deepEqual(cases.map(c=>c[0]).sort(), [...LINE_TYPES].sort());
  for (const [type, inputs, sell, materials, hours] of cases) {
    const quote = fresh();
    quote.takeoffs = [];
    quote.lines = [{id:'test',name:'Test',type,takeoffDriven:false,inputs:{...EMPTY_INPUTS,...inputs},overrides:{},priceOverride:null}];
    const result = calculateQuoteV27(quote).lines[0];
    close(result.finalPrice,sell,type);
    close(result.materialsBudget,materials,type);
    close(result.hoursAllowed,hours,type);
  }
});

test('JSON round trip preserves edited assumptions, links, and overrides without mutation', () => {
  const quote = fresh();
  quote.takeoffs[0].quantity = 45;
  quote.lines[1].priceOverride = 4200;
  quote.settings.burdenedRateOverride = 45;
  const serialized = JSON.stringify(quote);
  const before = calculateQuoteV27(quote);
  assert.equal(JSON.stringify(quote), serialized);
  assert.deepEqual(calculateQuoteV27(JSON.parse(serialized)), before);
  close(calculateQuoteV27(fresh()).totals.price, 28953.192);
});

test('invalid financial inputs and missing references fail instead of silently pricing', () => {
  const changes = [
    q=>{q.commission=1;}, q=>{q.commission=-0.1;}, q=>{q.settings.efficiency=0;},
    q=>{q.lines[0].priceOverride=NaN;}, q=>{q.takeoffs[0].quantity=-1;},
    q=>{q.takeoffs[0].lineId='missing';}, q=>{q.takeoffs[0].materialId='missing';},
    q=>{q.takeoffs[0].tradeId='missing';}, q=>{q.lines[1].id=q.lines[0].id;},
    q=>{q.lines[0].type='unknown';}, q=>{q.settings.burdenedRateOverride=Infinity;},
  ];
  for (const change of changes) { const quote=fresh(); change(quote); assert.throws(()=>calculateQuoteV27(quote)); }
});
