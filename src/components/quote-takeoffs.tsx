'use client';
import {useMemo,useRef,useState} from 'react';
import {calculateQuoteV27,type QuoteV27,type Takeoff} from '@/lib/quote-v27';
import {applySheetCells,takeoffWorksheetRows,EMPTY_TAKEOFF_DESCRIPTION,SHEET_COLUMNS,type SheetColumn} from '@/lib/quote-takeoff-grid';
import {useQuoteCatalog} from './use-quote-catalog';
import styles from './quote-takeoffs.module.css';
const headers=['Line item','Description','Qty','Unit','Unit cost $','Section ×','Resale?','Material $','Labor hrs','Ext hrs','Notes','Trade'];
type Cell=[number,number];
export function QuoteTakeoffs({quote,edit,selected,onSelectItem,onAddItem,readOnly}: {
  quote:QuoteV27;edit:(change:(next:QuoteV27)=>void)=>void;selected:string;onSelectItem?:(id:string)=>void;onAddItem:()=>void;readOnly:boolean;
}) {
  const [rowCapacity,setRowCapacity]=useState(50);
  const rowCount=Math.min(5000,Math.max(rowCapacity,Math.ceil(quote.takeoffs.length/50)*50));
  const rows=takeoffWorksheetRows(quote,rowCount,selected);
  const [active,setActive]=useState<Cell|null>(null);
  const [selectionEnd,setSelectionEnd]=useState<Cell|null>(null);
  const [end,setEnd]=useState<number|null>(null);
  const [error,setError]=useState('');
  const [picker,setPicker]=useState<number|null>(null);
  const [query,setQuery]=useState('');
  const [choiceKind,setChoiceKind]=useState('all');
  const selectedItem=quote.lines.find(line=>line.id===selected)??quote.lines[0];
  const drag=useRef<{row:number;column:number;end:number;value:string}|null>(null);
  const live=useQuoteCatalog();
  const calculation=useMemo(()=>{
    try {return calculateQuoteV27(quote);} catch {return null; /* Workbook displays calculation errors. */}
  },[quote]);
  const computed=new Map(calculation?.takeoffs.map(row=>[row.id,row]));
  const catalog=new Map(quote.catalog.map(material=>[material.id,material]));
  const choices=live.materials??quote.catalog;
  const filteredChoices=useMemo(()=>choices.filter(material=>
    material.name.toLowerCase().includes(query.toLowerCase()) &&
    (choiceKind==='all'||( /^(hours?|hrs?)$/i.test(material.unit) ? choiceKind==='labor' : choiceKind==='materials'))
  ),[choices,query,choiceKind]);
  function valueAt(r:number,key:SheetColumn):string {
    const row:Takeoff=rows[r], saved=r<quote.takeoffs.length;
    if(key==='lineId')return quote.lines.find(line=>line.id===row.lineId)?.name??'';
    if(key==='description')return row.description===EMPTY_TAKEOFF_DESCRIPTION?'':row.description;
    if(key==='unit')return row.unit??catalog.get(row.materialId??'')?.unit??'';
    if(key==='tradeId')return quote.trades.find(trade=>trade.id===row.tradeId)?.name??'';
    if(key==='materialTotal')return saved?(computed.get(row.id)?.cost??0).toLocaleString('en-US',{style:'currency',currency:'USD'}):'';
    if(key==='extendedHours')return saved?String(computed.get(row.id)?.extendedHours??0):'';
    if(key==='resale')return row.resale?'Yes':'No';
    if(key==='unitCostOverride')return saved&&(row.description!==EMPTY_TAKEOFF_DESCRIPTION||row.quantity||row.unitCostOverride)?(row.unitCostOverride??catalog.get(row.materialId??'')?.unitCost??0).toLocaleString('en-US',{style:'currency',currency:'USD'}):'';
    return saved?String((key==='sections'?row[key]:row[key]||'')??''):'';
  }
  function apply(row:number,column:number,values:string[][]) {
    if(readOnly)return false;
    try {
      const trial=structuredClone(quote);
      applySheetCells(trial,rowCount,selected,row,column,values,live.materials);
      edit(next=>{next.takeoffs=trial.takeoffs;next.catalog=trial.catalog;});setError('');return true;
    } catch(e){setError(e instanceof Error?e.message:'Check the entered cells.');return false;}
  }
  function finish() {
    const range=drag.current;drag.current=null;setEnd(null);
    if(range&&range.end!==range.row)apply(range.end>range.row?range.row+1:range.end,range.column,
      Array.from({length:Math.abs(range.end-range.row)},()=>[range.value]));
  }
  return <div className={styles.sheet}>
    <div className={styles.toolbar}><strong>Item Takeoffs — the scratchpad that feeds the Quote Builder</strong><button disabled={readOnly} onClick={onAddItem}>Add item</button>
      <button disabled={rowCount>=5000} onClick={()=>setRowCapacity(Math.min(5000,rowCount+50))}>Add 50 more rows</button><span>{rowCount} rows</span>
      {active && active[0]<quote.takeoffs.length && <button disabled={!live.materials} onClick={()=>apply(active[0],1,[[quote.takeoffs[active[0]].description]])}>Use latest price for selected row</button>}
    </div>
    <div className={styles.itemToolbar}>
      <label>Working on item <select aria-label="Working on item" value={selectedItem?.id??''} onChange={e=>{onSelectItem?.(e.target.value);setPicker(null);}}>{quote.lines.map(line=><option key={line.id} value={line.id}>{line.name}</option>)}</select></label>
      <label>Item name <input aria-label="Working item name" key={selectedItem?.id+'-'+selectedItem?.name} defaultValue={selectedItem?.name??''} disabled={readOnly} onBlur={e=>{const name=e.target.value.trim();if(name&&name!==selectedItem?.name)edit(next=>{const line=next.lines.find(l=>l.id===selectedItem?.id);if(line)line.name=name;});else e.target.value=selectedItem?.name??'';}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>
      <span>Every new row belongs to this item. Existing rows keep their item labels.</span>
    </div>
    <div className={styles.catalogStatus}><span role="status">{live.status}</span><button type="button" onClick={()=>void live.refresh()}>Refresh now</button></div>
    {live.warnings.length>0&&<p role="status">{live.warnings.join(' ')}</p>}
    <p>Build each item from as many material and labor rows as you need. Choose ▼ in Description, or type freely. Enter labor in Labor hrs. Drag the blue cell corner to repeat a value; Shift-click to copy a range.</p>
    {error&&<p role="alert">{error}</p>}
    <div className={styles.scroll} onCopy={e=>{
      if(!active||!selectionEnd)return;e.preventDefault();const copied=[];
      for(let r=Math.min(active[0],selectionEnd[0]);r<=Math.max(active[0],selectionEnd[0]);r++) {
        const cells=[];for(let c=Math.min(active[1],selectionEnd[1]);c<=Math.max(active[1],selectionEnd[1]);c++)cells.push(valueAt(r,SHEET_COLUMNS[c]));
        copied.push(cells.join('\t'));
      }
      e.clipboardData.setData('text/plain',copied.join('\n'));
    }}>
      <table aria-label="Item takeoffs worksheet"><colgroup><col style={{width:32}}/>{[235,245,50,60,85,55,55,85,70,55,190,100].map((width,i)=><col key={i} style={{width}}/>)}<col style={{width:28}}/></colgroup>
        <thead><tr><th>#</th>{headers.map(h=><th key={h}>{h==='Line item'?'Line item (matches Quote Builder)':h==='Labor hrs'?'Labor hrs (per section)':h}</th>)}<th/></tr></thead>
        <tbody>{rows.map((row,r)=><tr key={r} className={r>0&&rows[r-1].lineId!==row.lineId?styles.itemStart:undefined}><th>{r+1}</th>{SHEET_COLUMNS.map((key,c)=>{
          const display=valueAt(r,key), protectedCell=key==='materialTotal'||key==='extendedHours';
          const isActive=active?.[0]===r&&active[1]===c;
          const inSelection=active&&selectionEnd&&r>=Math.min(active[0],selectionEnd[0])&&r<=Math.max(active[0],selectionEnd[0])&&c>=Math.min(active[1],selectionEnd[1])&&c<=Math.max(active[1],selectionEnd[1]);
          const filling=active&&end!==null&&active[1]===c&&r>=Math.min(active[0],end)&&r<=Math.max(active[0],end);
          const lookedUp=(key==='unit'&&row.unit===undefined||key==='unitCostOverride'&&row.unitCostOverride===null)&&row.materialId;
          return <td key={key} data-takeoff-row={r} className={`${key==='description'?styles.descriptionCell:''} ${protectedCell||lookedUp?styles.computed:''} ${isActive?styles.active:''} ${filling||inSelection?styles.filling:''}`}
            onMouseDown={e=>{if(e.shiftKey&&active){e.preventDefault();setSelectionEnd([r,c]);}else setSelectionEnd(null);}}
            onFocus={()=>setActive([r,c])} onPaste={e=>{
              const text=e.clipboardData.getData('text/plain');
              if(text.includes('\t')||text.includes('\n')){e.preventDefault();apply(r,c,text.replace(/\r/g,'').replace(/\n$/,'').split('\n').map(line=>line.split('\t')));}
            }}>
            {protectedCell?display:key==='resale'?<select aria-label={`Resale row ${r+1}`} disabled={readOnly} value={display} onChange={e=>apply(r,c,[[e.target.value]])}><option>No</option><option>Yes</option></select>:
              <input key={`${key}-${display}`} aria-label={`${headers[c]} row ${r+1}`} defaultValue={display} disabled={readOnly}
                title={key==='unitCostOverride'?row.unitCostOverride===null?'Catalog price · type to override':'Manual cost · clear to restore catalog':display}
                list={key==='lineId'?'takeoff-lineId':key==='tradeId'?'takeoff-tradeId':undefined}
                inputMode={['quantity','unitCostOverride','sections','hours'].includes(key)?'decimal':'text'}
                placeholder={key==='sections'?'1':''}
                onBlur={e=>{if(e.target.value!==display&&!apply(r,c,[[e.target.value]]))e.target.value=display;}}
                onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.currentTarget.value=display;e.currentTarget.blur();}}}/>
            }
            {key==='description'&&<button type="button" className={styles.choose} disabled={readOnly} aria-label={`Choose material or labor row ${r+1}`} aria-expanded={picker===r} onMouseDown={e=>e.preventDefault()} onClick={()=>{setPicker(picker===r?null:r);setQuery('');setChoiceKind('all');}}>▾</button>}
            {key==='description'&&picker===r&&<div role="dialog" aria-label={`Material or labor for row ${r+1}`} className={styles.picker} onKeyDown={e=>{if(e.key==='Escape')setPicker(null);}}>
              <div className={styles.pickerTools}><input autoFocus aria-label="Search materials and labor" placeholder="Search materials and labor…" value={query} onChange={e=>setQuery(e.target.value)}/><button type="button" aria-label="Close material chooser" onClick={()=>setPicker(null)}>×</button></div>
              <select aria-label="Catalog choices" value={choiceKind} onChange={e=>setChoiceKind(e.target.value)}><option value="all">All materials and labor</option><option value="materials">Materials / other costs</option><option value="labor">Labor (hours)</option></select>
              <div className={styles.choices}>{filteredChoices.slice(0,100).map(material=><button type="button" key={material.id} onClick={()=>{if(apply(r,c,[[material.name]]))setPicker(null);}}><span>{material.name}</span><small>{material.unit} · {material.unitCost.toLocaleString('en-US',{style:'currency',currency:'USD'})}</small></button>)}{!filteredChoices.length&&<p>No matching catalog entries. Close this list to type a custom description.</p>}</div>
              <small>{filteredChoices.length} choices{filteredChoices.length>100?' · type to narrow the list':''}</small>
            </div>}
            {isActive&&!protectedCell&&!readOnly&&<button tabIndex={-1} className={styles.handle} aria-label="Drag to fill column"
              onPointerDown={e=>{e.preventDefault();const input=e.currentTarget.parentElement?.querySelector('input');const value=input?.value??display;input?.blur();e.currentTarget.setPointerCapture(e.pointerId);drag.current={row:r,column:c,end:r,value};}}
              onPointerMove={e=>{if(!drag.current)return;const td=window.document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-takeoff-row]');if(td){const target=Number(td.getAttribute('data-takeoff-row'));drag.current.end=target;setEnd(target);}}}
              onPointerUp={finish} onPointerCancel={()=>{drag.current=null;setEnd(null);}}/>
            }
          </td>;
        })}<td><button disabled={readOnly||r>=quote.takeoffs.length} aria-label={`Remove takeoff row ${r+1}`} onClick={()=>edit(next=>{next.takeoffs=next.takeoffs.filter(t=>t.id!==row.id);})}>×</button></td></tr>)}</tbody>
      </table>
    </div>
    <datalist id="takeoff-lineId">{quote.lines.map(line=><option key={line.id} value={line.name}>{line.id}</option>)}</datalist>
    <datalist id="takeoff-tradeId">{quote.trades.map(trade=><option key={trade.id} value={trade.name}>{trade.id}</option>)}</datalist>
    <p>Blank sections = 1. Clear unit cost to restore the recorded catalog price; 0 is an explicit override. Live choices refresh every 15 seconds. Use latest price for selected row to update an existing selection. Saved rows do not reprice automatically.</p>
  </div>;
}
