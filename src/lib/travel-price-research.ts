import type { QuoteV27 } from './quote-v27.ts';

export const TRAVEL_PRICE_KINDS = ['airfare', 'hotel', 'vehicle'] as const;
export type TravelPriceKind = typeof TRAVEL_PRICE_KINDS[number];
export type TravelSearch = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
};
export type TravelPriceOffer = {
  kind: TravelPriceKind;
  offerId: string;
  label: string;
  unitAmount: number;
  unit: 'round_trip_person' | 'room_night' | 'vehicle_day';
  source: 'lab_fixture';
};
export type TravelPriceSelection = TravelPriceOffer & {
  search: TravelSearch;
  searchedAt: string;
  selectedAt: string;
};
export type TravelResearch = {
  version: 1;
  selections: Partial<Record<TravelPriceKind, TravelPriceSelection>>;
};

const units: Record<TravelPriceKind, TravelPriceOffer['unit']> = {
  airfare: 'round_trip_person', hotel: 'room_night', vehicle: 'vehicle_day',
};
const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value + 'T00:00:00Z'))
  && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;

export function parseTravelSearch(value: unknown): TravelSearch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Travel search details are required.');
  const input = value as Record<string, unknown>;
  const origin = typeof input.origin === 'string' ? input.origin.trim().toUpperCase() : '';
  const destination = typeof input.destination === 'string' ? input.destination.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || origin === destination)
    throw new Error('Enter different three-letter origin and destination airport codes.');
  if (!isDate(input.departureDate) || !isDate(input.returnDate) || input.returnDate <= input.departureDate)
    throw new Error('Enter valid departure and return dates in order.');
  const nights = (Date.parse(input.returnDate) - Date.parse(input.departureDate)) / 86400000;
  if (nights > 90) throw new Error('Travel searches may cover at most 90 days.');
  return { origin, destination, departureDate: input.departureDate, returnDate: input.returnDate };
}

const sample: TravelPriceOffer[] = [
  { kind: 'airfare', offerId: 'sample-air-1', label: 'Sample economy fare', unitAmount: 480, unit: 'round_trip_person', source: 'lab_fixture' },
  { kind: 'airfare', offerId: 'sample-air-2', label: 'Sample flexible fare', unitAmount: 690, unit: 'round_trip_person', source: 'lab_fixture' },
  { kind: 'hotel', offerId: 'sample-hotel-1', label: 'Sample standard room', unitAmount: 220, unit: 'room_night', source: 'lab_fixture' },
  { kind: 'hotel', offerId: 'sample-hotel-2', label: 'Sample venue-area room', unitAmount: 295, unit: 'room_night', source: 'lab_fixture' },
  { kind: 'vehicle', offerId: 'sample-car-1', label: 'Sample midsize vehicle', unitAmount: 85, unit: 'vehicle_day', source: 'lab_fixture' },
  { kind: 'vehicle', offerId: 'sample-car-2', label: 'Sample cargo-capable SUV', unitAmount: 125, unit: 'vehicle_day', source: 'lab_fixture' },
];

/** Lab substitute only: these figures are fixed examples, independent of route or dates. */
export function labTravelOffers(): TravelPriceOffer[] {
  return sample.map(offer => ({ ...offer }));
}

export function parseTravelResearch(value: unknown): TravelResearch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid travel research.');
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || !data.selections || typeof data.selections !== 'object' || Array.isArray(data.selections))
    throw new Error('Unsupported travel research version.');
  const raw = data.selections as Record<string, unknown>;
  if (Object.keys(raw).some(key => !TRAVEL_PRICE_KINDS.includes(key as TravelPriceKind)))
    throw new Error('Unknown travel price category.');
  const selections: TravelResearch['selections'] = {};
  for (const kind of TRAVEL_PRICE_KINDS) {
    if (raw[kind] === undefined) continue;
    const item = raw[kind];
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid travel selection.');
    const row = item as Record<string, unknown>;
    const fixture = sample.find(offer => offer.offerId === row.offerId && offer.kind === kind);
    if (row.kind !== kind || row.source !== 'lab_fixture' || row.unit !== units[kind]
      || !fixture || row.label !== fixture.label || row.unitAmount !== fixture.unitAmount
      || typeof row.searchedAt !== 'string' || Number.isNaN(Date.parse(row.searchedAt))
      || typeof row.selectedAt !== 'string' || Number.isNaN(Date.parse(row.selectedAt)))
      throw new Error('Invalid sample travel selection.');
    selections[kind] = {
      ...fixture, search: parseTravelSearch(row.search),
      searchedAt: row.searchedAt as string, selectedAt: row.selectedAt as string,
    };
  }
  return { version: 1, selections };
}

export function applyTravelOffer(quote: QuoteV27, offer: TravelPriceOffer, search: TravelSearch, searchedAt: string, selectedAt: string) {
  if (!quote.estimators) throw new Error('Enable estimators before applying travel research.');
  const known = labTravelOffers().find(row => row.offerId === offer.offerId && row.kind === offer.kind);
  if (!known || JSON.stringify(known) !== JSON.stringify(offer)) throw new Error('Unknown sample travel offer.');
  const normalized = parseTravelSearch(search);
  const selection = parseTravelResearch({
    version: 1, selections: {
      [offer.kind]: { ...offer, search: normalized, searchedAt, selectedAt },
    },
  }).selections[offer.kind]!;
  quote.estimators.travel.rates[offer.kind === 'airfare' ? 'airfare' : offer.kind === 'hotel' ? 'hotel' : 'vehicle'] = offer.unitAmount;
  quote.travelResearch = {
    version: 1, selections: { ...quote.travelResearch?.selections, [offer.kind]: selection },
  };
}

export function clearTravelSelection(quote: QuoteV27, kind: TravelPriceKind) {
  if (quote.travelResearch) delete quote.travelResearch.selections[kind];
}
