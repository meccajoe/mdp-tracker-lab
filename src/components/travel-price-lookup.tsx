"use client";

import { useState } from 'react';
import { adaFetch } from '@/lib/ada-client';
import {
  applyTravelOffer, labTravelOffers, type TravelPriceOffer, type TravelResearch, type TravelSearch,
} from '@/lib/travel-price-research';
import type { QuoteV27 } from '@/lib/quote-v27';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const labels = { airfare: 'Airfare per round trip / person', hotel: 'Hotel per room / night', vehicle: 'Vehicle per day' };
const kinds = ['airfare', 'hotel', 'vehicle'] as const;
type Result = { search: TravelSearch; offers: TravelPriceOffer[]; searchedAt: string; sample: true };

export function TravelPriceLookup({ workspaceId, readOnly, research, edit }: {
  workspaceId: string;
  readOnly: boolean;
  research?: TravelResearch;
  edit: (change: (quote: QuoteV27) => void) => void;
}) {
  const previous = research?.selections.airfare?.search ?? research?.selections.hotel?.search ?? research?.selections.vehicle?.search;
  const [search, setSearch] = useState<TravelSearch>(previous ?? { origin: '', destination: '', departureDate: '', returnDate: '' });
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = (key: keyof TravelSearch, value: string) => {
    setSearch(current => ({ ...current, [key]: value })); setResult(null); setError('');
  };
  async function lookup() {
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await adaFetch(`/api/quote-workspaces/${workspaceId}/travel-prices`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(search),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Sample search failed.');
      if (payload.sample !== true || !Array.isArray(payload.offers)) throw new Error('Unexpected sample response.');
      // The server and client share the fixed lab catalog. Never accept an arbitrary price from the response.
      const known = labTravelOffers();
      if (payload.offers.length !== known.length || payload.offers.some((offer: TravelPriceOffer, index: number) => JSON.stringify(offer) !== JSON.stringify(known[index])))
        throw new Error('Unexpected sample prices.');
      setResult(payload as Result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Sample search failed.'); }
    finally { setBusy(false); }
  }
  return <section className="mb-5 rounded border border-amber-400/60 bg-amber-50/50 p-4 dark:bg-amber-950/20" aria-label="Sample travel price lookup">
    <h3 className="font-semibold">Travel price lookup · Lab sample</h3>
    <p className="mt-1 text-xs text-muted-foreground">Fixed sample prices for testing the quote workflow. They are not live fares, availability, or bookable offers. Dates and airports document the estimate; sample prices do not vary by route.</p>
    <div className="mt-3 flex flex-wrap gap-3">{([
      ['origin', 'Origin airport'], ['destination', 'Destination airport'], ['departureDate', 'Departure'], ['returnDate', 'Return'],
    ] as const).map(([key, label]) => <label key={key} className="text-xs">{label}<input aria-label={label} disabled={readOnly || busy} className="mt-1 block w-36 rounded border border-border bg-background px-2 py-1.5 text-sm" type={key.endsWith('Date') ? 'date' : 'text'} maxLength={key.endsWith('Date') ? undefined : 3} placeholder={key === 'origin' ? 'DFW' : key === 'destination' ? 'ORD' : undefined} value={search[key]} onChange={event => change(key, event.target.value)} /></label>)}</div>
    <button type="button" disabled={readOnly || busy} onClick={() => void lookup()} className="mt-3 rounded border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-50">{busy ? 'Loading samples…' : 'Find sample prices'}</button>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    {result && <div className="mt-4 grid gap-3 sm:grid-cols-3">{kinds.map(kind => <div key={kind} className="rounded border border-border bg-background p-3"><h4 className="text-sm font-semibold">{labels[kind]}</h4><div className="mt-2 space-y-2">{result.offers.filter(offer => offer.kind === kind).map(offer => <div key={offer.offerId} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{offer.label}<br /><strong>{money(offer.unitAmount)}</strong></span><button type="button" disabled={readOnly} className="rounded border px-2 py-1 text-xs disabled:opacity-50" onClick={() => edit(q => applyTravelOffer(q, offer, result.search, result.searchedAt, new Date().toISOString()))}>Use sample</button></div>)}</div></div>)}</div>}
    {research && Object.keys(research.selections).length > 0 && <p className="mt-3 text-xs text-muted-foreground">Saved sample inputs: {kinds.filter(kind => research.selections[kind]).map(kind => `${kind} ${money(research.selections[kind]!.unitAmount)}`).join(' · ')}. Editing a unit cost clears its sample evidence. Save the workbook revision to keep selections.</p>}
  </section>;
}
