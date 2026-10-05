import type { QuoteV27 } from './quote-v27';
export const TAKEOFF_COLUMNS = ['lineId','description','materialId','quantity','unitCostOverride','sections','hours','tradeId','resale'] as const;
export type TakeoffColumn = typeof TAKEOFF_COLUMNS[number];
/** Apply a rectangular paste/fill atomically. IDs are resolved, never copied from sheet text. */
export function applyTakeoffCells(quote: QuoteV27, start: number, column: number, values: string[][]): void {
  const rows = structuredClone(quote.takeoffs);
  if (start < 0 || start + values.length > rows.length) throw new Error('Add enough rows before pasting.');
  for (const [offset, cells] of values.entries()) {
    const row = rows[start + offset];
    for (const [delta, text] of cells.entries()) {
      const key = TAKEOFF_COLUMNS[column + delta];
      if (!key) throw new Error('Calculated columns cannot be pasted into.');
      const value = text.trim();
      if (key === 'lineId' || key === 'materialId' || key === 'tradeId') {
        if (!value && key !== 'lineId') { row[key] = null; if (key === 'materialId') row.unitCostOverride = 0; continue; }
        const source = key === 'lineId' ? quote.lines : key === 'materialId' ? quote.catalog : quote.trades;
        const exact = source.find(item => item.id === value);
        const matches = exact ? [exact] : source.filter(item => item.name === value);
        if (matches.length !== 1) throw new Error(`Choose an existing, unambiguous ${key === 'lineId' ? 'item' : key === 'materialId' ? 'material' : 'trade'}: ${value}`);
        row[key] = matches[0].id;
        if (key === 'materialId') { row.description = matches[0].name; row.unitCostOverride = null; }
      } else if (key === 'description') {
        if (!value) throw new Error('Description cannot be blank.');
        row.description = value;
      } else if (key === 'resale') {
        if (!/^(true|false|yes|no|1|0|)$/i.test(value)) throw new Error('Resale must be Yes or No.');
        row.resale = /^(true|yes|1)$/i.test(value);
      } else {
        if (!value && (key === 'sections' || key === 'unitCostOverride')) { row[key] = null; continue; }
        const numeric = Number(value.replace(/[$,]/g, ''));
        if (!Number.isFinite(numeric) || numeric < 0) throw new Error('Enter a nonnegative number.');
        row[key] = numeric;
      }
    }
    if (!row.materialId && row.unitCostOverride === null && row.quantity > 0) throw new Error('Custom materials need a unit cost.');
  }
  quote.takeoffs = rows;
}


export const EMPTY_TAKEOFF_DESCRIPTION = 'Untitled takeoff';
/** View-only rows do not dirty a quote merely by opening the worksheet. */
export function takeoffWorksheetRows(quote: QuoteV27, count: number, selected: string) {
  const lineId = quote.lines.find(line => line.id === selected)?.id ?? quote.lines[0]?.id ?? '';
  return Array.from({length: Math.min(5000, Math.max(count, quote.takeoffs.length))}, (_, index) =>
    quote.takeoffs[index] ?? {id: `empty-takeoff-${index}`, lineId,
      description: EMPTY_TAKEOFF_DESCRIPTION, materialId: null, tradeId: null,
      quantity: 0, sections: null, unitCostOverride: 0, hours: 0, resale: false});
}

/** Materialize through the edited row to preserve worksheet positions on save/reopen. */
export function applyWorksheetCells(quote: QuoteV27, count: number, selected: string,
  start: number, column: number, values: string[][]) {
  if (start < 0 || start + values.length > count || count > 5000) throw new Error('Add more rows before pasting.');
  const next = structuredClone(quote);
  const rows = takeoffWorksheetRows(next, count, selected);
  if (!rows[start]?.lineId) throw new Error('This quote needs an item before entering takeoffs.');
  next.takeoffs = rows.slice(0, Math.max(next.takeoffs.length, start + values.length))
    .map((row, index) => index < quote.takeoffs.length ? row : {...row, id: crypto.randomUUID()});
  applyTakeoffCells(next, start, column, values);
  quote.takeoffs = next.takeoffs;
}
