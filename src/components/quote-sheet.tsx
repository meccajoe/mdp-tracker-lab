"use client";
import {useState} from "react";
import {clearQuoteItem} from "@/lib/quote-item-actions";

import { calculateQuoteV27, LINE_TYPES, type Inputs, type QuoteV27 } from '@/lib/quote-v27';
import styles from './quote-sheet.module.css';

type Calculation = ReturnType<typeof calculateQuoteV27>;
const amount = (n: number) => n.toLocaleString('en-US', {style:'currency',currency:'USD'});
const numeric = (n: number) => n === 0 ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const currency = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const inputs: { key: keyof Inputs; heading: string }[] = [
  {key:'materials',heading:'Fab material cost $'}, {key:'resale',heading:'Resale parts $ (in item)'},
  {key:'hours',heading:'Hours'}, {key:'days',heading:'Fab days (1 person)'},
  {key:'sqft',heading:'Sqft (gfx / SEG)'}, {key:'panels',heading:'beMatrix panels'},
  {key:'rental',heading:'beMatrix rental charge $'}, {key:'siteDays',heading:'Site days'},
  {key:'travelDays',heading:'Travel days'},
];
const outputs = [
  ['materialsBudget','Materials / other budget'], ['hoursAllowed','Hours allowed'],
  ['laborBudget','Labor $ (cost)'], ['buildBudget','Build budget'],
  ['contingency','Contingency'], ['indirect','Indirect levy'], ['margin','Margin'],
] as const;
const headers = ['Item name','Line type',...inputs.map(i=>i.heading),'Support crew',
  'Cost $ (equip / props / expenses / freight / dump fees)','COMPUTED PRICE','Price override','FINAL PRICE',
  ...outputs.map(([,label])=>label),'Margin %'];

export function QuoteSheet({ quote, calculation, edit, onTakeoffs, onAdd, onViewChange }: {
  quote: QuoteV27;
  calculation: Calculation | null;
  edit: (change: (next: QuoteV27) => void) => void;
  onTakeoffs: (lineId: string) => void;
  onAdd?: () => void;
  onViewChange?: () => void;
}) {
  const [pendingClear,setPendingClear]=useState<string|null>(null);
  const [clearId,setClearId]=useState(quote.lines[0]?.id??'');
  const [showDetails,setShowDetails]=useState(false);
  const visibleInputs=showDetails?inputs:inputs.slice(0,3);
  // Keep workbook letters stable when estimator-detail columns F–L are collapsed.
  const visibleHeaders=headers.map((label,index)=>({label,index})).filter(({index})=>showDetails||index<5||index>11);
  const rows = new Map(calculation?.lines.map(line=>[line.id,line]));
  function inputCell(line: QuoteV27['lines'][number], key: keyof Inputs, label: string) {
    const calculated = rows.get(line.id)?.calculatedInputs[key] ?? line.inputs[key];
    const override = line.overrides[key];
    const overridden = override != null;
    const update = (value: number | null) => edit(next=>{next.lines.find(l=>l.id===line.id)!.overrides[key]=value;});
    return <td key={key} className={`${styles.entry} ${overridden ? styles.overridden : ''}`}>
      <div className={styles.inputCell}>
        {['materials','resale','rental','cost'].includes(key)&&<span className={styles.currencyPrefix} aria-hidden="true">$</span>}
        <input type="number" min="0" step="any" aria-label={`${label} · ${line.name}`}
          title={`Calculated: ${numeric(calculated)}. Enter a manual override; clear to restore.`}
          value={overridden ? override : calculated === 0 ? '' : calculated} placeholder="—"
          onChange={e=>update(e.target.value==='' ? null : Number(e.target.value))}/>
        {overridden && <button type="button" className={styles.restore} aria-label={`Restore ${label} · ${line.name}`} title={`Restore calculated: ${numeric(calculated)}`} onClick={()=>update(null)}>↺</button>}
      </div>
    </td>;
  }
  return <div className={styles.sheet}>
    <div className={styles.heading}>
      <h2>Quote Builder — enter ESTIMATES, prices and budgets compute themselves</h2>
      <p>Yellow cells are editable. ↺ restores a calculated input. Clear a price override to restore the computed price.</p>
      <div className={styles.toolbar}>
        <label>Sales commission % <input type="number" min="0" max="99.99" step="any" aria-label="Sales commission percent" value={quote.commission===0?'':Number((quote.commission*100).toFixed(8))} placeholder="—" onChange={e=>edit(next=>{next.commission=Number(e.target.value)/100;})}/></label>
        {onAdd&&<button type="button" onClick={onAdd}>Add item</button>}
        <button type="button" aria-expanded={showDetails} onClick={()=>{setShowDetails(value=>!value);onViewChange?.();}}>{showDetails?'Hide estimate details':'Show estimate details'}</button>
        <label>Item to clear <select aria-label="Item to clear" value={clearId} onChange={e=>setClearId(e.target.value)}>{quote.lines.map((line,index)=><option key={line.id} value={line.id}>Item {index+1} — {line.name}</option>)}</select></label>
        <button type="button" disabled={!quote.lines.some(line=>line.id===clearId)} title="Reset this item and remove its linked takeoff rows. Undo restores everything." onClick={()=>setPendingClear(clearId)}>Clear item</button>
        <span>Open an item’s takeoffs with ↗. Scroll right for pricing and budgets.</span>
      </div>
    </div>
    {pendingClear&&<div role="alertdialog" aria-label="Clear quote item" className={styles.clearPrompt}>
      <span>Clear {quote.lines.find(line=>line.id===pendingClear)?.name}? This resets its Quote Builder row, removes linked takeoff rows and unlinks estimator outputs. Undo restores everything.</span>
      <button type="button" onClick={()=>{edit(next=>clearQuoteItem(next,pendingClear));setPendingClear(null);}}>Clear this item</button>
      <button type="button" onClick={()=>setPendingClear(null)}>Cancel</button>
    </div>}
    <div className={styles.scroll} role="region" aria-label="Quote spreadsheet" tabIndex={0}>
      <table key={String(showDetails)} aria-label="Quote Builder estimates and budgets" style={{width:showDetails?2200:1640}}>
        <colgroup><col style={{width:60}}/><col style={{width:190}}/><col style={{width:150}}/>{visibleHeaders.slice(2).map(({index})=><col key={index} style={{width:index===12?100:80}}/>)}</colgroup>
        <thead>
          <tr className={styles.letters}><th aria-label="Item number"/>{visibleHeaders.map(({index})=><th key={index} scope="col" className={index===0?styles.frozen:undefined}>{String.fromCharCode(65+index)}</th>)}</tr>
          <tr className={styles.columnHeaders}><th>Item #</th>{visibleHeaders.map(({label,index})=><th key={label} scope="col" className={index===0?styles.frozen:undefined}>{label}</th>)}</tr>
        </thead>
        <tbody>{quote.lines.map((line,index)=>{
          const row=rows.get(line.id);
          return <tr key={line.id} data-section={line.type==='beMatrix / SEG'?'bematrix':line.type.includes('Travel')?'travel':line.type.includes('Design')?'design':line.type.includes('Project Management')?'management':/Installer|Labor|Stage/.test(line.type)?'labor':'items'}>
            <th scope="row" className={styles.rowNumber}>{`Item ${index+1}`}</th>
            <td className={`${styles.entry} ${styles.frozen}`}><div className={styles.nameCell}><input aria-label={`Line item ${index+1}`} value={line.name} onChange={e=>edit(next=>{next.lines.find(l=>l.id===line.id)!.name=e.target.value;})}/><button type="button" aria-label={`Open takeoffs · ${line.name}`} title="Open takeoffs" onClick={()=>onTakeoffs(line.id)}>↗</button></div></td>
            <td className={styles.entry}><select aria-label={`Line type · ${line.name}`} value={line.type} onChange={e=>edit(next=>{next.lines.find(l=>l.id===line.id)!.type=e.target.value as typeof line.type;})}>{LINE_TYPES.map(type=><option key={type}>{type}</option>)}</select></td>
            {visibleInputs.map(({key,heading})=>inputCell(line,key,heading))}
            {showDetails&&<td title="Support person-days are entered in Estimators → Install. This template column does not feed pricing." className={styles.unused}>—</td>}
            {inputCell(line,'cost','Cost $')}
            <td>{row ? amount(row.calculatedPrice) : '—'}</td>
            <td className={styles.entry}><div className={styles.inputCell}><span className={styles.currencyPrefix} aria-hidden="true">$</span><input type="number" min="0" step="any" aria-label={`Price override · ${line.name}`} value={line.priceOverride??''} placeholder="—" onChange={e=>edit(next=>{next.lines.find(l=>l.id===line.id)!.priceOverride=e.target.value===''?null:Number(e.target.value);})}/>{line.priceOverride!==null && <button type="button" className={styles.restore} aria-label={`Restore price · ${line.name}`} title="Restore computed price" onClick={()=>edit(next=>{next.lines.find(l=>l.id===line.id)!.priceOverride=null;})}>↺</button>}</div></td>
            <td className={styles.finalPrice}>{row ? amount(row.finalPrice) : '—'}</td>
            {outputs.map(([key])=><td key={key}>{row ? (key==='hoursAllowed'?numeric(row[key]):amount(row[key])) : '—'}</td>)}
            <td>{row?.marginPercent != null ? `${(row.marginPercent*100).toFixed(1)}%` : '—'}</td>
          </tr>;
        })}</tbody>
        {calculation && <tfoot><tr><th/><th className={styles.frozen}>GRAND TOTAL</th><td colSpan={showDetails?12:5}/><td>{amount(calculation.totals.calculatedPrice)}</td><td/><td>{amount(calculation.totals.price)}</td>{outputs.map(([key])=><td key={key}>{key==='hoursAllowed'?numeric(calculation.totals[key]):amount(calculation.totals[key])}</td>)}<td>{calculation.totals.price ? `${(calculation.totals.margin/calculation.totals.price*100).toFixed(1)}%` : '—'}</td></tr></tfoot>}
      </table>
    </div>
    {calculation && <div className={styles.economics}><h3>Project economics</h3><dl>{[
      ['Total quote (incl. PM fee)',calculation.totals.price],['Total build budget',calculation.totals.buildBudget],
      ['Contingency reserve',calculation.totals.contingency],['Indirect labor levy',calculation.totals.indirect],
      ['Margin after reserve + levy',calculation.totals.margin],['PM bonus reserve (top tier)',calculation.totals.pmBonus],
      ['OpEx recovery',calculation.totals.opex],['Planned net',calculation.totals.netProfit],
    ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{currency(Number(value))}</dd></div>)}</dl></div>}
  </div>;
}
