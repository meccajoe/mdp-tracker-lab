'use client';
import { useRef, useState } from 'react';
import { calculateQuoteV27, type QuoteV27 } from '@/lib/quote-v27';
import { applyWorksheetCells, takeoffWorksheetRows, EMPTY_TAKEOFF_DESCRIPTION, TAKEOFF_COLUMNS } from '@/lib/quote-takeoff-grid';
import styles from './quote-takeoffs.module.css';
const headers = ['Item','Description','Catalog material','Qty','Unit cost $','Sections ×','Hours','Trade','Resale'];
export function QuoteTakeoffs({quote, edit, selected, onAddItem, readOnly}: {quote: QuoteV27; edit:(change:(next:QuoteV27)=>void)=>void; selected:string; onAddItem:()=>void; readOnly:boolean}) {
  const [rowCapacity,setRowCapacity] = useState(50);
  const rowCount = Math.min(5000, Math.max(rowCapacity, Math.ceil(quote.takeoffs.length / 50) * 50));
  const worksheetRows = takeoffWorksheetRows(quote, rowCount, selected);
  const [active,setActive] = useState<[number,number] | null>(null);
  const [selectionEnd,setSelectionEnd] = useState<[number,number] | null>(null);
  const [end,setEnd] = useState<number|null>(null);
  const [error,setError] = useState('');
  const drag = useRef<{row:number;column:number;end:number;value:string}|null>(null);
  let calculation: ReturnType<typeof calculateQuoteV27> | null = null;
  try { calculation = calculateQuoteV27(quote); } catch { /* Workbook displays calculation errors. */ }
  function apply(row:number,column:number,values:string[][]) {
    if(readOnly) return false;
    try { const trial=structuredClone(quote); applyWorksheetCells(trial,rowCount,selected,row,column,values); edit(next=>{next.takeoffs=trial.takeoffs;}); setError(''); return true; }
    catch(e) {setError(e instanceof Error ? e.message : 'Check the entered cells.');return false;}
  }
  function raw(row:number,column:number) {return String(worksheetRows[row][TAKEOFF_COLUMNS[column]]??'');}
  function finish() {const range=drag.current;drag.current=null;setEnd(null);if(range && range.end!==range.row) {const first=range.end>range.row?range.row+1:range.end;apply(first,range.column,Array.from({length:Math.abs(range.end-range.row)},()=>[range.value]));}}
  return <div className={styles.sheet}>
    <div className={styles.toolbar}><strong>Takeoffs · all items</strong><button onClick={onAddItem}>Add item</button><button disabled={rowCount>=5000} onClick={()=>setRowCapacity(Math.min(5000,rowCount+50))}>Add 50 more rows</button><span>{rowCount} rows</span></div>
    <p>Click a cell, then drag its blue corner up or down to repeat it. Paste spreadsheet cells starting at the focused cell. Shift-click another cell to select a range and copy it. Use Tab to move between fields. Start typing in any row. New rows use the current item; change the Item cell to assign another.</p>
    {error && <p role="alert">{error}</p>}
    <div className={styles.scroll} onCopy={e=>{if(!active || !selectionEnd)return;e.preventDefault();const rows=[];for(let r=Math.min(active[0],selectionEnd[0]);r<=Math.max(active[0],selectionEnd[0]);r++){const cells=[];for(let c=Math.min(active[1],selectionEnd[1]);c<=Math.max(active[1],selectionEnd[1]);c++){const key=TAKEOFF_COLUMNS[c];const source=key==='lineId'?quote.lines:key==='materialId'?quote.catalog:key==='tradeId'?quote.trades:null;cells.push(source ? source.find(x=>x.id===worksheetRows[r][key])?.name??'' : raw(r,c));}rows.push(cells.join('\t'));}e.clipboardData.setData('text/plain',rows.join('\n'));}}><table><thead><tr><th>#</th>{headers.map(h=><th key={h}>{h}</th>)}<th>Extended $</th><th>Total hrs</th><th/></tr></thead><tbody>{worksheetRows.map((row,r)=>{
      const computed=calculation?.takeoffs.find(t=>t.id===row.id);
      return <tr key={row.id}><th>{r+1}</th>{TAKEOFF_COLUMNS.map((key,c)=>{
        const source=key==='lineId'?quote.lines:key==='materialId'?quote.catalog:key==='tradeId'?quote.trades:null;
        const empty = r >= quote.takeoffs.length;
        const display=key==='description' && row.description===EMPTY_TAKEOFF_DESCRIPTION ? '' : empty && !source ? '' : source ? source.find(x=>x.id===row[key])?.name??'' : raw(r,c);
        const isActive=active?.[0]===r && active[1]===c;
        const inSelection=active && selectionEnd && r>=Math.min(active[0],selectionEnd[0])&&r<=Math.max(active[0],selectionEnd[0])&&c>=Math.min(active[1],selectionEnd[1])&&c<=Math.max(active[1],selectionEnd[1]);
        const filling=active && end!==null && active[1]===c && r>=Math.min(active[0],end)&&r<=Math.max(active[0],end);
        return <td key={key} data-takeoff-row={r} className={`${isActive?styles.active:''} ${filling||inSelection?styles.filling:''}`} onMouseDown={e=>{if(e.shiftKey && active){e.preventDefault();setSelectionEnd([r,c]);}else setSelectionEnd(null);}} onFocus={()=>setActive([r,c])} onPaste={e=>{const text=e.clipboardData.getData('text/plain');if(text.includes('\t')||text.includes('\n')){e.preventDefault();apply(r,c,text.replace(/\r/g,'').replace(/\n$/,'').split('\n').map(line=>line.split('\t')));}}}>
          {key==='resale'?<select aria-label={`Resale row ${r+1}`} value={row.resale?'Yes':'No'} onChange={e=>apply(r,c,[[e.target.value]])}><option>No</option><option>Yes</option></select>:<input key={`${row.id}-${key}-${display}`} aria-label={`${headers[c]} row ${r+1}`} defaultValue={display} list={source?`takeoff-${key}`:undefined} inputMode={source||key==='description'?'text':'decimal'} placeholder={key==='sections'?'1':key==='unitCostOverride'?`$${computed?.unitCost??0}`:source?'Choose…':''} onBlur={e=>{if(e.target.value!==display && !apply(r,c,[[e.target.value]]))e.target.value=display;}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.currentTarget.value=display;e.currentTarget.blur();}}}/>}
          {isActive&&!readOnly&&<button className={styles.handle} aria-label="Drag to fill column" onPointerDown={e=>{e.preventDefault();const input=e.currentTarget.parentElement?.querySelector('input');input?.blur();e.currentTarget.setPointerCapture(e.pointerId);drag.current={row:r,column:c,end:r,value:e.currentTarget.parentElement?.querySelector('input,select') instanceof HTMLInputElement ? (e.currentTarget.parentElement.querySelector('input') as HTMLInputElement).value : raw(r,c)};}} onPointerMove={e=>{if(!drag.current)return;const td=window.document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-takeoff-row]');if(td){const target=Number(td.getAttribute('data-takeoff-row'));drag.current.end=target;setEnd(target);}}} onPointerUp={finish} onPointerCancel={()=>{drag.current=null;setEnd(null);}} onKeyDown={e=>{if(e.key==='Escape'){drag.current=null;setEnd(null);}}} />}
        </td>;
      })}<td className={styles.computed}>{(computed?.cost??0).toLocaleString('en-US',{style:'currency',currency:'USD'})}</td><td className={styles.computed}>{computed?.extendedHours??0}</td><td><button disabled={r>=quote.takeoffs.length} aria-label={`Remove takeoff row ${r+1}`} onClick={()=>edit(next=>{next.takeoffs=next.takeoffs.filter(t=>t.id!==row.id);})}>×</button></td></tr>;
    })}</tbody></table></div>
    {(['lineId','materialId','tradeId'] as const).map(key=><datalist key={key} id={`takeoff-${key}`}>{(key==='lineId'?quote.lines:key==='materialId'?quote.catalog:quote.trades).map(item=><option key={item.id} value={item.name}>{item.id}</option>)}</datalist>)}
    <p>Blank sections = 1. Blank unit cost uses the catalog; 0 is an explicit override. Green cells are calculated. Undo restores a bulk edit.</p>
  </div>;
}
