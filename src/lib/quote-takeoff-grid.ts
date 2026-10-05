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

export const SHEET_COLUMNS = ['lineId','itemName','description','quantity','unit','unitCostOverride','sections','resale','materialTotal','hours','extendedHours','notes','tradeId'] as const;
export type SheetColumn = typeof SHEET_COLUMNS[number];
/** Spreadsheet-facing edits use live choices, but never replace catalog prices already in use. */
export function applySheetCells(quote: QuoteV27, count: number, selected: string, start: number,
  column: number, values: string[][], liveMaterials: QuoteV27['catalog'] | null) {
  const next=structuredClone(quote);
  // Materialize rows only inside this transaction; any invalid cell rejects the entire paste.
  applyWorksheetCells(next,count,selected,start,3,values.map(()=>['0']));
  for(let r=0;r<values.length;r++) {
    const row=next.takeoffs[start+r];
    // The materialization call must not replace an existing quantity.
    row.quantity=quote.takeoffs[start+r]?.quantity??0;
    for(let c=0;c<values[r].length;c++) {
      const key=SHEET_COLUMNS[column+c], value=values[r][c].trim();
      if(!key)throw new Error('Paste extends beyond the worksheet.');
      if(key==='materialTotal'||key==='extendedHours') {
        if(value)throw new Error('Calculated columns are protected. Paste into editable columns only.');
      } else if(key==='itemName') {
        if(!value||value.length>2000)throw new Error('Enter an item name (up to 2,000 characters).');
        const line=next.lines.find(line=>line.id===row.lineId)!;
        if(next.lines.some(other=>other.id!==line.id&&other.name.toLowerCase()===value.toLowerCase()))throw new Error('Another item already uses that name. Choose a unique name.');
        line.name=value;
      } else if(key==='notes'||key==='unit') {
        if(value.length>(key==='unit'?200:2000))throw new Error(`${key} is too long.`);
        row[key]=value;
      } else if(key==='description') {
        const matches=(liveMaterials??next.catalog).filter(m=>m.name===value||m.id===value);
        if(matches.length>1)throw new Error('Catalog description is ambiguous.');
        if(matches.length===1) {
          const material=matches[0];
          const existing=next.catalog.find(m=>m.id===material.id);
          if(existing && (existing.unitCost!==material.unitCost || existing.name!==material.name || existing.unit!==material.unit))throw new Error('Catalog identity conflict. Refresh and retry.');
          if(!existing)next.catalog.push({...material});
          row.materialId=material.id;row.description=material.name;row.unitCostOverride=null;delete row.unit;
        } else {
          const old=next.catalog.find(m=>m.id===row.materialId);
          row.unitCostOverride=row.unitCostOverride??old?.unitCost??0;
          row.unit=row.unit??old?.unit??'';
          row.materialId=null;row.description=value||EMPTY_TAKEOFF_DESCRIPTION;
        }
      } else {
        const legacyColumn=TAKEOFF_COLUMNS.indexOf(key);
        // Set the target row directly via the shared conversion/validation rules.
        const itemNumber=key==='lineId'?/^Item (\d+)$/.exec(value):null;
        const resolved=itemNumber?next.lines[Number(itemNumber[1])-1]?.id:value;
        if(resolved===undefined||(key==='lineId'&&!resolved))throw new Error('Choose an existing item number.');
        applyTakeoffCells(next,start+r,legacyColumn,[[resolved]]);
        Object.assign(row,next.takeoffs[start+r]);next.takeoffs[start+r]=row;
      }
    }
  }
  // Keep all referenced snapshots; trim unused history only if the existing schema limit is reached.
  if(next.catalog.length>2000){const used=new Set(next.takeoffs.map(r=>r.materialId));next.catalog=next.catalog.filter(m=>used.has(m.id));}
  if(next.catalog.length>2000)throw new Error('Quote has reached its 2,000 catalog snapshot limit.');
  quote.catalog=next.catalog;quote.takeoffs=next.takeoffs;quote.lines=next.lines;
}

/** Numbers follow the persisted quote-item order; names can change without changing links. */
export function quoteItemLabel(quote:QuoteV27,lineId:string):string {
  const index=quote.lines.findIndex(line=>line.id===lineId);
  return index<0?'Unknown item':`Item ${index+1}`;
}

/** Filtered paste/fill touches only visible rows and commits as one atomic edit. */
export function applyVisibleSheetCells(quote:QuoteV27,count:number,selected:string,visibleIndices:number[],start:number,column:number,values:string[][],liveMaterials:QuoteV27['catalog']|null) {
  const offset=visibleIndices.indexOf(start);
  if(offset<0||offset+values.length>visibleIndices.length)throw new Error('Add more visible rows before pasting.');
  const targets=visibleIndices.slice(offset,offset+values.length);
  if(targets.every((target,i)=>target===start+i)) {
    applySheetCells(quote,count,selected,start,column,values,liveMaterials);return;
  }
  const next=structuredClone(quote);
  for(const [i,cells] of values.entries())applySheetCells(next,count,selected,visibleIndices[offset+i],column,[cells],liveMaterials);
  quote.takeoffs=next.takeoffs;quote.catalog=next.catalog;quote.lines=next.lines;
}
