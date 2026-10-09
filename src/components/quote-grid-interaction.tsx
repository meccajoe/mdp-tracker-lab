'use client';
import {isEditingText} from './quote-cell-editing';
import {moveToVerticalCell} from './quote-cell-navigation';
import {useRef,type ReactNode} from 'react';
type Point={row:number;column:number;table:HTMLTableElement};
/** Shared keyboard navigation and selection statistics for rendered workbook tables. */
export function QuoteGridInteraction({children,onSummary}:{children:ReactNode;onSummary:(text:string)=>void}) {
  const root=useRef<HTMLDivElement>(null),anchor=useRef<Point|null>(null),dragging=useRef(false);
  const setSummary=onSummary;
  function point(target:EventTarget|null){const cell=(target as HTMLElement)?.closest?.('td,th') as HTMLTableCellElement|null;const row=cell?.parentElement as HTMLTableRowElement|null;return cell&&row?.parentElement?.tagName==='TBODY'?{row:row.sectionRowIndex,column:cell.cellIndex,table:cell.closest('table')!}:null;}
  function select(end:Point){if(!anchor.current||anchor.current.table!==end.table)return;const start=anchor.current;let total=0,count=0;start.table.querySelectorAll('tbody tr').forEach((row,r)=>Array.from((row as HTMLTableRowElement).cells).forEach((cell,c)=>{
    const selected=r>=Math.min(start.row,end.row)&&r<=Math.max(start.row,end.row)&&c>=Math.min(start.column,end.column)&&c<=Math.max(start.column,end.column);
    cell.toggleAttribute('data-grid-selected',selected);if(!selected||cell.tagName==='TH')return;
    const text=(cell.querySelector<HTMLInputElement|HTMLTextAreaElement>('input,textarea')?.value??cell.textContent??'').trim().replace(/[$,%\s,]/g,'');
    if(text&&/^-?\d+(\.\d+)?$/.test(text)){total+=Number(text);count++;}
  }));setSummary(`Selected numbers: ${count} · Sum: ${total.toLocaleString('en-US',{maximumFractionDigits:2})}`);}
  return <div ref={root} onMouseDown={e=>{if((e.target as HTMLElement).closest('button,[role=listbox],[role=dialog]'))return;const p=point(e.target);if(p){if(e.shiftKey&&anchor.current?.table===p.table){e.preventDefault();select(p);return;}anchor.current=p;dragging.current=true;setSummary('');root.current?.querySelectorAll('[data-grid-selected]').forEach(cell=>cell.removeAttribute('data-grid-selected'));}}}
    onMouseOver={e=>{if(dragging.current&&e.buttons===1){const p=point(e.target);if(p&&anchor.current&&(p.row!==anchor.current.row||p.column!==anchor.current.column)){window.getSelection()?.removeAllRanges();select(p);}}}}
    onMouseUp={()=>{dragging.current=false;}}
    onKeyDown={e=>{
      if(e.key==='Tab'&&!e.defaultPrevented&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!(e.target as HTMLElement).closest('[role=dialog],[role=listbox]')){if(moveToVerticalCell(e.target as HTMLElement,e.shiftKey?-1:1))e.preventDefault();return;}
      if(isEditingText(e.target))return;
      if(e.defaultPrevented||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)||e.altKey||e.metaKey||e.ctrlKey)return;
      const dialog=(e.target as HTMLElement).closest('[role=dialog]');
      if(dialog){if(e.key==='ArrowUp'||e.key==='ArrowDown'){const choices=Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).filter(button=>!button.disabled&&!/Close|×/.test(button.textContent??''));const current=choices.indexOf(e.target as HTMLButtonElement);e.preventDefault();choices[Math.max(0,Math.min(choices.length-1,current+(e.key==='ArrowDown'?1:-1)))]?.focus();}return;}
      if((e.target as HTMLElement).closest('[role=listbox]'))return;
      if(e.target instanceof HTMLSelectElement&&(e.key==='ArrowUp'||e.key==='ArrowDown'))return;
      const p=point(e.target);if(!p)return;e.preventDefault();
      const rows=p.table.querySelectorAll('tbody tr');const r=p.row+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0),c=p.column+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0);
      const cell=(rows?.[r] as HTMLTableRowElement|undefined)?.cells[c];if(!cell)return;
      const target=cell.querySelector<HTMLElement>('input,textarea,select,button')??cell;target.tabIndex=target===cell?-1:target.tabIndex;target.focus();
      if(target instanceof HTMLInputElement&&target.type!=='number')target.select();
    }}>
    {children}
  </div>;
}
