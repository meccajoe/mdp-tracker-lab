'use client';
import {selectTextCell,editTextCell,isEditingText} from './quote-cell-editing';
import {useEffect,useMemo,useRef,useState} from 'react';
import {calculateQuoteV27,type QuoteV27,type Takeoff} from '@/lib/quote-v27';
import {applyVisibleSheetCells,quoteItemLabel,takeoffWorksheetRows,EMPTY_TAKEOFF_DESCRIPTION,SHEET_COLUMNS,type SheetColumn} from '@/lib/quote-takeoff-grid';
import {useQuoteCatalog} from './use-quote-catalog';
import styles from './quote-takeoffs.module.css';
import {loadQuoteLibrary} from '@/lib/quote-library-client';
import {QuoteReusableItems} from './quote-reusable-items';
import {QuoteMaterialCell} from './quote-material-cell';
const columns=SHEET_COLUMNS.filter(key=>key!=='tradeId');
const headers=['Item #','Item name','Materials & Labor','Qty','Unit','Unit cost $','Section ×','Resale?','Material $','Labor hrs','Ext hrs','Notes'];
type Cell=[number,number];
export function QuoteTakeoffs({quote,edit,selected,onSelectItem,onAddItem,readOnly,restoreKey=0,save,workspaceId,libraryItem=false}: {
  libraryItem?:boolean;workspaceId:string;save:()=>void;restoreKey?:number;quote:QuoteV27;edit:(change:(next:QuoteV27)=>void)=>void;selected:string;onSelectItem?:(id:string)=>void;onAddItem:()=>void;readOnly:boolean;
}) {
  const scrollRef=useRef<HTMLDivElement>(null);
  const [rowCapacity,setRowCapacity]=useState(50);
  const rowCount=Math.min(5000,Math.max(rowCapacity,Math.ceil(quote.takeoffs.length/50)*50));
  const [filterOpen,setFilterOpen]=useState(false);
  const [filterItem,setFilterItem]=useState('');
  const [filterQuery,setFilterQuery]=useState('');
  const defaultItem=filterItem||selected;
  const rows=takeoffWorksheetRows(quote,rowCount,defaultItem);
  const visibleRows=rows.map((row,index)=>({row,index})).filter(({row})=>!filterItem||!row.lineId||row.lineId===filterItem);
  const visibleIndices=visibleRows.map(({index})=>index);
  const [active,setActive]=useState<Cell|null>(null);
  const [selectionEnd,setSelectionEnd]=useState<Cell|null>(null);
  const [end,setEnd]=useState<number|null>(null);
  const [endColumn,setEndColumn]=useState<number|null>(null);
  const [error,setError]=useState('');
  const [itemPicker,setItemPicker]=useState<number|null>(null);
  const [learnedUsage,setLearnedUsage]=useState<Record<string,number>>({});
  useEffect(()=>{let active=true,generation=0;const load=()=>{const started=++generation;void loadQuoteLibrary({excludeWorkspaceId:workspaceId,maxAgeMs:60000}).then(({quotes})=>{const usage:Record<string,number>={};for(const saved of quotes)for(const [name,count] of Object.entries(saved.document.catalogUsage??{}))usage[name]=(usage[name]??0)+count;if(active&&started===generation)setLearnedUsage(usage);}).catch(()=>{if(active&&started===generation)setLearnedUsage({});});};const clear=()=>{if(active)setLearnedUsage({});load();};load();window.addEventListener('quote-library-identity-changed',clear);window.addEventListener('quote-workbook-saved',load);return()=>{active=false;window.removeEventListener('quote-library-identity-changed',clear);window.removeEventListener('quote-workbook-saved',load);};},[workspaceId]);
  const usage={...learnedUsage};for(const [name,count] of Object.entries(quote.catalogUsage??{}))usage[name]=(usage[name]??0)+count;
  const filterChoices=quote.lines.filter(line=>`${quoteItemLabel(quote,line.id)} ${line.name}`.toLowerCase().includes(filterQuery.toLowerCase()));
  function setFilter(id:string) {
    setFilterItem(id);setFilterOpen(false);setActive(null);setSelectionEnd(null);setItemPicker(null);setEnd(null);setEndColumn(null);drag.current=null;
  }
  const drag=useRef<{row:number;column:number;end:number;endColumn:number;value:string}|null>(null);
  const live=useQuoteCatalog();
  const calculation=useMemo(()=>{
    try {return calculateQuoteV27(quote);} catch {return null; /* Workbook displays calculation errors. */}
  },[quote]);
  const computed=new Map(calculation?.takeoffs.map(row=>[row.id,row]));
  const catalog=new Map(quote.catalog.map(material=>[material.id,material]));
  const choices=live.materials??quote.catalog;
  const units=Array.from(new Set(['each','sheet','feet','sqft','hours','day','lot','gallon','quart','roll','pair','set',...choices.map(m=>m.unit),...quote.takeoffs.map(row=>row.unit??'')].filter(Boolean))).sort();
  function valueAt(r:number,key:SheetColumn):string {
    const row:Takeoff=rows[r], saved=r<quote.takeoffs.length;
    if(key==='lineId')return quoteItemLabel(quote,row.lineId);
    if(key==='itemName'){const name=quote.lines.find(line=>line.id===row.lineId)?.name??'';return name===quoteItemLabel(quote,row.lineId)?'':name;}
    if(key==='description')return row.description===EMPTY_TAKEOFF_DESCRIPTION?'':row.description;
    if(key==='unit')return row.unit??catalog.get(row.materialId??'')?.unit??'';
    if(key==='tradeId')return quote.trades.find(trade=>trade.id===row.tradeId)?.name??'';
    if(key==='materialTotal')return saved?(computed.get(row.id)?.cost??0).toLocaleString('en-US',{style:'currency',currency:'USD'}):'';
    if(key==='extendedHours')return saved?String(computed.get(row.id)?.extendedHours??0):'';
    if(key==='resale')return row.resale?'Yes':'No';
    if(key==='unitCostOverride')return saved&&(row.description!==EMPTY_TAKEOFF_DESCRIPTION||row.quantity||row.unitCostOverride)?(row.unitCostOverride??catalog.get(row.materialId??'')?.unitCost??0).toLocaleString('en-US',{style:'currency',currency:'USD'}):'';
    return saved?String((key==='sections'?row[key]:row[key]||'')??''):'';
  }
  function apply(row:number,column:number,values:string[][],picked=false) {
    if(readOnly)return false;
    try {
      if(values.some(cells=>column+cells.length>columns.length))throw new Error('Paste extends beyond the visible worksheet columns.');
      const trial=structuredClone(quote);
      applyVisibleSheetCells(trial,rowCount,defaultItem,visibleIndices,row,column,values,live.materials);
      edit(next=>{next.takeoffs=trial.takeoffs;next.catalog=trial.catalog;next.lines=trial.lines;if(picked){const name=values[0][0];next.catalogUsage={...next.catalogUsage,[name]:(next.catalogUsage?.[name]??0)+1};}});if(column===0)onSelectItem?.(trial.takeoffs[row].lineId);setError('');return true;
    } catch(e){setError(e instanceof Error?e.message:'Check the entered cells.');return false;}
  }
  function finish() {
    const range=drag.current;drag.current=null;setEnd(null);setEndColumn(null);
    if(range&&(range.end!==range.row||range.endColumn!==range.column)) {
      const first=Math.min(range.row,range.end),last=Math.max(range.row,range.end),col=Math.min(range.column,range.endColumn),lastCol=Math.max(range.column,range.endColumn);
      const itemFill=range.column===1&&range.endColumn===1;
      const value=itemFill?rows[range.row].lineId:range.value;
      apply(first,itemFill?0:col,visibleIndices.filter(index=>index>=first&&index<=last).map(()=>Array.from({length:lastCol-col+1},()=>value)));
    }
  }
  return <div className={styles.sheet}>
    <div className={styles.toolbar}><strong>Item Takeoffs — the scratchpad that feeds the Quote Builder</strong>{!libraryItem&&<button disabled={readOnly} onClick={()=>{setFilter('');onAddItem();}}>Add item</button>}
      <button disabled={readOnly||quote.takeoffs.length>=5000} onClick={()=>{const id=filterItem||(active?rows[active[0]].lineId:selected);edit(next=>{const last=next.takeoffs.findLastIndex(row=>row.lineId===id);const added=takeoffWorksheetRows({...next,takeoffs:[]},5,id).map(row=>({...row,id:crypto.randomUUID()}));next.takeoffs.splice(last+1,0,...added.slice(0,5000-next.takeoffs.length));});setActive(null);setSelectionEnd(null);}}>Insert 5 blank rows after item</button>
      <button disabled={readOnly||!active||active[0]>=quote.takeoffs.length} onClick={()=>{if(!active)return;const index=active[0];edit(next=>{next.takeoffs.splice(index,1);});setActive(null);setSelectionEnd(null);setItemPicker(null);}}>Delete selected row</button>
      <button disabled={rowCount>=5000} onClick={()=>setRowCapacity(Math.min(5000,rowCount+50))}>Add 50 more rows</button><span>{rowCount} rows</span>
      {active && active[0]<quote.takeoffs.length && <button disabled={!live.materials} onClick={()=>apply(active[0],2,[[quote.takeoffs[active[0]].description]])}>Use latest price for selected row</button>}
    </div>
    <div className={styles.itemToolbar}>
      <strong>{filterItem?`Showing ${quoteItemLabel(quote,filterItem)} — ${quote.lines.find(line=>line.id===filterItem)?.name}`:'All items — one worksheet'}</strong>
      <button type="button" aria-expanded={filterOpen} onClick={()=>{setFilterOpen(!filterOpen);setFilterQuery('');}}>Filter items</button>
      {filterItem&&<button type="button" onClick={()=>setFilter('')}>Show all items</button>}
      <span>Assign only the rows you need. Drag-copy Item # or name to link more rows.</span>
      {filterOpen&&<div className={styles.filterPanel} role="dialog" aria-label="Filter takeoffs by item" onKeyDown={e=>{if(e.key==='Escape')setFilterOpen(false);}}>
        <div className={styles.pickerTools}><input autoFocus aria-label="Search item number or name" placeholder="Search item # or name…" value={filterQuery} onChange={e=>setFilterQuery(e.target.value)}/><button type="button" aria-label="Close item filter" onClick={()=>setFilterOpen(false)}>×</button></div>
        <div className={styles.choices}><button type="button" onClick={()=>setFilter('')}>All items</button>{filterChoices.map(line=><button type="button" key={line.id} onClick={()=>setFilter(line.id)}><strong>{quoteItemLabel(quote,line.id)}</strong><span>{line.name}</span></button>)}{!filterChoices.length&&<p>No matching items.</p>}</div>
      </div>}
    </div>
    {!readOnly&&!libraryItem&&<QuoteReusableItems quote={quote} edit={edit} live={live.materials} onSelect={id=>{onSelectItem?.(id);setFilter('');}} save={save}/>}
    <div className={styles.catalogStatus}><span role="status">{live.status}</span><button type="button" onClick={()=>void live.refresh()}>Refresh now</button></div>
    {live.warnings.length>0&&<p role="status">{live.warnings.join(' ')}</p>}
    <p>Build each item from as many material and labor rows as you need. Click Materials & Labor and type to search, or enter custom text. Enter labor in Labor hrs. Double-click or F2 edits text; Delete clears a selected cell. Drag the blue cell corner to repeat a value; Shift-click to copy a range.</p>
    {calculation?.lines.filter(line=>line.type==='beMatrix / SEG'&&(!filterItem||line.id===filterItem)&&(line.inputs.rental||line.inputs.sqft)).map(line=><p key={line.id}><strong>{line.name}</strong>: frame rental ${line.inputs.rental.toFixed(2)} + SEG ({line.inputs.sqft} sq. ft.) ${(line.inputs.sqft*quote.settings.graphicsSell).toFixed(2)} · Final quote ${line.finalPrice.toFixed(2)}. Dimensions and destination are set in beMatrix Estimator.</p>)}
    {error&&<p role="alert">{error}</p>}
    <div ref={scrollRef} className={styles.scroll}
      onPointerMove={e=>{if(!drag.current)return;const td=window.document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-takeoff-row]');if(td){const target=Number(td.getAttribute('data-takeoff-row'));drag.current.end=target;drag.current.endColumn=drag.current.column<=1?drag.current.column:Number(td.getAttribute('data-takeoff-column'));setEndColumn(drag.current.endColumn);setEnd(target);}}}
      onPointerUp={finish} onPointerCancel={()=>{drag.current=null;setEnd(null);setEndColumn(null);}}
      onCopy={e=>{
      if(!active||!selectionEnd)return;e.preventDefault();const copied=[];
      for(const r of visibleIndices.filter(index=>index>=Math.min(active[0],selectionEnd[0])&&index<=Math.max(active[0],selectionEnd[0]))) {
        const cells=[];for(let c=Math.min(active[1],selectionEnd[1]);c<=Math.max(active[1],selectionEnd[1]);c++)cells.push(valueAt(r,SHEET_COLUMNS[c]));
        copied.push(cells.join('\t'));
      }
      e.clipboardData.setData('text/plain',copied.join('\n'));
    }}>
      <table aria-label="Item takeoffs worksheet"><colgroup><col style={{width:32}}/>{[80,180,125,50,60,85,55,55,85,70,55,320].map((width,i)=><col key={i} style={{width}}/>)}</colgroup>
        <thead><tr><th>#</th>{headers.map(h=><th key={h}>{h==='Labor hrs'?'Labor hrs (per section)':h}</th>)}</tr></thead>
        <tbody>{visibleRows.map(({row,index:r})=><tr key={r} className={r>0&&rows[r-1].lineId!==row.lineId?styles.itemStart:undefined}><th>{r+1}</th>{columns.map((key,c)=>{
          const display=valueAt(r,key), protectedCell=key==='materialTotal'||key==='extendedHours';
          const isActive=active?.[0]===r&&active[1]===c;
          const inSelection=active&&selectionEnd&&r>=Math.min(active[0],selectionEnd[0])&&r<=Math.max(active[0],selectionEnd[0])&&c>=Math.min(active[1],selectionEnd[1])&&c<=Math.max(active[1],selectionEnd[1]);
          const filling=active&&end!==null&&c>=Math.min(active[1],endColumn??active[1])&&c<=Math.max(active[1],endColumn??active[1])&&r>=Math.min(active[0],end)&&r<=Math.max(active[0],end);
          const lookedUp=(key==='unit'&&row.unit===undefined||key==='unitCostOverride'&&row.unitCostOverride===null)&&row.materialId;
          return <td key={key} data-takeoff-row={r} data-takeoff-column={c} className={`${key==='description'?styles.descriptionCell:''} ${protectedCell||lookedUp?styles.computed:''} ${isActive?styles.active:''} ${filling||inSelection?styles.filling:''}`}
            onMouseDown={e=>{if(e.shiftKey&&active){e.preventDefault();setSelectionEnd([r,c]);}else setSelectionEnd(null);}}
            tabIndex={protectedCell?-1:undefined}
            onKeyDownCapture={e=>{if((e.key==='Delete'||e.key==='Backspace')&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!e.shiftKey&&!readOnly&&!e.nativeEvent.isComposing){
              if(protectedCell||key==='description'||isEditingText(e.target))return;
              e.preventDefault();e.stopPropagation();
              if(e.target instanceof HTMLInputElement)e.target.value=key==='unitCostOverride'&&row.materialId?(catalog.get(row.materialId)?.unitCost??0).toLocaleString('en-US',{style:'currency',currency:'USD'}):'';
              apply(r,c,[['']]);setItemPicker(null);
            }}}
            onFocus={()=>setActive([r,c])} onPaste={e=>{
              const text=e.clipboardData.getData('text/plain');
              if(text.includes('\t')||text.includes('\n')){e.preventDefault();apply(r,c,text.replace(/\r/g,'').replace(/\n$/,'').split('\n').map(line=>line.split('\t')));}
            }}>
            {protectedCell?display:key==='description'?<QuoteMaterialCell key={`${restoreKey}-${display}`} clearWholeCell value={display} label={`Materials & Labor row ${r+1}`} materials={choices} usage={usage} disabled={readOnly} commit={(name,picked)=>{return apply(r,c,[[name]],picked);}}/>:key==='lineId'?<>
              <button type="button" className={styles.itemChoice} aria-label={`Item number row ${r+1}`} aria-expanded={itemPicker===r} disabled={readOnly} onClick={()=>setActive([r,c])} onDoubleClick={()=>setItemPicker(r)} onKeyDown={e=>{if(e.key==='Enter'||e.key==='F2'){e.preventDefault();setItemPicker(r);}}} title="Click to select and drag-fill; double-click or Enter to choose an item">{display||'—'}</button><button type="button" className={styles.itemArrow} aria-label={`Choose item row ${r+1}`} disabled={readOnly} onClick={()=>setItemPicker(itemPicker===r?null:r)}>▾</button>
              {itemPicker===r&&<div role="dialog" aria-label={`Choose item for row ${r+1}`} className={styles.picker} onKeyDown={e=>{if(e.key==='Escape')setItemPicker(null);}}>
                <div className={styles.pickerTools}><strong>Assign this row to an item</strong><button type="button" aria-label="Close item chooser" onClick={()=>setItemPicker(null)}>×</button></div>
                <div className={styles.choices}><button type="button" onClick={()=>{if(apply(r,c,[['']]))setItemPicker(null);}}>Clear assignment</button>{quote.lines.map(line=><button type="button" key={line.id} autoFocus={line.id===row.lineId} onClick={()=>{if(apply(r,c,[[line.id]]))setItemPicker(null);}}><strong>{quoteItemLabel(quote,line.id)}</strong><span>{line.name===quoteItemLabel(quote,line.id)?'Name this item…':line.name}</span></button>)}</div>
              </div>}
            </>:key==='resale'?<select aria-label={`Resale row ${r+1}`} disabled={readOnly} value={display} onChange={e=>apply(r,c,[[e.target.value]])}><option>No</option><option>Yes</option></select>:key==='unit'?<select aria-label={`Unit row ${r+1}`} value={display} disabled={readOnly} onChange={e=>apply(r,c,[[e.target.value]])}><option value=""/>{units.map(unit=><option key={unit}>{unit}</option>)}</select>:
              <input key={`${restoreKey}-${key}-${display}`} aria-label={`${headers[c]} row ${r+1}`} defaultValue={display} disabled={readOnly}
                onFocus={e=>selectTextCell(e.currentTarget)}
                onMouseUp={e=>{if(!isEditingText(e.currentTarget)){e.preventDefault();e.currentTarget.select();}}}
                onClick={e=>{if(e.detail===1)selectTextCell(e.currentTarget);}}
                onDoubleClick={e=>editTextCell(e.currentTarget)}
                onInput={e=>editTextCell(e.currentTarget)}
                title={key==='unitCostOverride'?row.unitCostOverride===null?'Catalog price · type to override':'Manual cost · clear to restore catalog':display}
                inputMode={['quantity','unitCostOverride','sections','hours'].includes(key)?'decimal':'text'}
                placeholder={key==='sections'?'1':key==='itemName'?'e.g. Golden Arch':''}
                onBlur={e=>{if(e.target.value!==display&&!apply(r,c,[[e.target.value]]))e.target.value=display;}}
                onKeyDown={e=>{if(e.key==='F2'){e.preventDefault();editTextCell(e.currentTarget);e.currentTarget.setSelectionRange(e.currentTarget.value.length,e.currentTarget.value.length);}if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.currentTarget.value=display;e.currentTarget.blur();}}}/>
            }
            {isActive&&!protectedCell&&!readOnly&&<button tabIndex={-1} className={styles.handle} aria-label="Drag to copy cell value"
              onPointerDown={e=>{e.preventDefault();e.stopPropagation();const input=e.currentTarget.parentElement?.querySelector('input');const value=input?.value??display;scrollRef.current?.setPointerCapture(e.pointerId);drag.current={row:r,column:c,end:r,endColumn:c,value};input?.blur();}}
              />
            }
          </td>;
        })}</tr>)}</tbody>
      </table>
    </div>

    <p>Blank sections = 1. Clear unit cost to restore the recorded catalog price; 0 is an explicit override. Live choices refresh every 15 seconds. Use latest price for selected row to update an existing selection. Saved rows do not reprice automatically.</p>
  </div>;
}
