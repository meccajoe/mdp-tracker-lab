/** Reuse formatters across workbook cells instead of constructing one per value. */
const currency=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const decimal=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
export const quoteMoney=(value:number)=>currency.format(value);
export const quoteNumber=(value:number)=>decimal.format(value);

/** Ungrouped numeric input display; empty values stay empty. */
export const quoteInputNumber=(value:unknown)=>value===null||value===undefined||value===''?'':Number.isFinite(Number(value))?String(Number(Number(value).toFixed(2))):String(value);
