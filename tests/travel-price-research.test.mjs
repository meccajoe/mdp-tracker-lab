import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateQuoteV27 } from '../src/lib/quote-v27.ts';
import { parseQuoteV27 } from '../src/lib/quote-v27-validation.ts';
import { applyTravelOffer, clearTravelSelection, labTravelOffers, parseTravelSearch } from '../src/lib/travel-price-research.ts';

const source = JSON.parse(readFileSync(new URL('../src/data/quote-v27-fonroche.json', import.meta.url)));
const search = { origin: 'DFW', destination: 'ORD', departureDate: '2026-11-04', returnDate: '2026-11-09' };
const selectedAt = '2026-09-29T15:00:00.000Z';
const sample = kind => labTravelOffers().find(offer => offer.kind === kind);

test('search requires real ordered dates and different airport codes', () => {
  assert.deepEqual(parseTravelSearch({ ...search, origin: ' dfw ' }), search);
  for (const invalid of [
    { ...search, origin: 'DF' }, { ...search, destination: 'DFW' },
    { ...search, departureDate: '2026-02-30' }, { ...search, returnDate: '2026-11-04' },
    { ...search, returnDate: '2027-03-01' },
  ]) assert.throws(() => parseTravelSearch(invalid));
});

test('applying three sample prices updates estimator math and survives saved revision parsing', () => {
  const quote = structuredClone(source);
  const before = calculateQuoteV27(quote);
  for (const kind of ['airfare', 'hotel', 'vehicle'])
    applyTravelOffer(quote, sample(kind), search, selectedAt, selectedAt);
  const restored = parseQuoteV27(JSON.parse(JSON.stringify(quote)));
  assert.equal(restored.estimators.travel.rates.airfare, 480);
  assert.equal(restored.estimators.travel.rates.hotel, 220);
  assert.equal(restored.estimators.travel.rates.vehicle, 85);
  assert.equal(restored.travelResearch.selections.hotel.search.destination, 'ORD');
  assert.equal(restored.travelResearch.selections.vehicle.source, 'lab_fixture');
  const after = calculateQuoteV27(restored);
  assert.notEqual(after.estimators.travelCost, before.estimators.travelCost);
  assert.equal(after.lines.find(line => line.id === 'line-32').inputs.cost, after.estimators.travel[0].total);
  assert.equal(after.lines.find(line => line.id === 'line-32').finalPrice, after.lines.find(line => line.id === 'line-32').inputs.cost * (1 + restored.settings.travelMarkup) / (1 - restored.commission));
});

test('manual cost edit can clear its evidence while retaining other selections', () => {
  const quote = structuredClone(source);
  applyTravelOffer(quote, sample('airfare'), search, selectedAt, selectedAt);
  applyTravelOffer(quote, sample('hotel'), search, selectedAt, selectedAt);
  quote.estimators.travel.rates.airfare = 640;
  clearTravelSelection(quote, 'airfare');
  assert.equal(quote.travelResearch.selections.airfare, undefined);
  assert.equal(quote.travelResearch.selections.hotel.unitAmount, 220);
  assert.equal(parseQuoteV27(quote).estimators.travel.rates.airfare, 640);
});

test('sample evidence rejects fabricated or mismatched offers', () => {
  const quote = structuredClone(source);
  assert.throws(() => applyTravelOffer(quote, { ...sample('hotel'), unitAmount: 1 }, search, selectedAt, selectedAt));
  applyTravelOffer(quote, sample('hotel'), search, selectedAt, selectedAt);
  const forged = structuredClone(quote);
  forged.travelResearch.selections.hotel.unitAmount = 1;
  assert.throws(() => parseQuoteV27(forged));
  forged.travelResearch.selections.hotel.unitAmount = 220;
  forged.travelResearch.selections.hotel.source = 'live_provider';
  assert.throws(() => parseQuoteV27(forged));
});

test('existing quote revision remains valid without research', () => {
  const restored = parseQuoteV27(source);
  assert.equal(restored.travelResearch, undefined);
  assert.equal(calculateQuoteV27(restored).totals.price, 28953.192);
});
