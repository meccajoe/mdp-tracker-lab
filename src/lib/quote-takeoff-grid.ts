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
