"use client";
import {useState} from "react";
import {useQuoteItemActions} from "./use-quote-item-actions";

import { calculateQuoteV27, type Inputs, type QuoteV27 } from '@/lib/quote-v27';
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
const builderTypes=[['Fabrication','Fabrication'],['beMatrix / SEG','Bematrix/SEG'],['Props / Resale','Props/Decor'],['Equipment Rental','Equipment']] as const;
const typeLabel=(type:string)=>builderTypes.find(([value])=>value===type)?.[1]??type;
const outputs = [
  ['materialsBudget','Materials / other budget'], ['hoursAllowed','Hours allowed'],
  ['laborBudget','Labor $ (cost)'], ['buildBudget','Build budget'],
  ['contingency','Contingency'], ['indirect','Indirect levy'], ['waste','Waste levy'], ['margin','Margin'],
] as const;
const headers = ['Item name','Line type',...inputs.map(i=>i.heading),'Support crew',
  'Cost $ (equip / props / expenses / freight / dump fees)','COMPUTED PRICE','Price override','FINAL PRICE',
  ...outputs.map(([,label])=>label),'Margin %'];

export function QuoteSheet({ quote, calculation, edit, onTakeoffs, onAdd, onViewChange, readOnly=false, libraryItem=false }: {
  quote: QuoteV27;
  calculation: Calculation | null;
  edit: (change: (next: QuoteV27) => void) => void;
  onTakeoffs: (lineId: string) => void;
  onAdd?: () => void;
  onViewChange?: () => void;
  readOnly?: boolean;
  libraryItem?: boolean;
}) {
  const itemActions=useQuoteItemActions({quote,edit,readOnly,libraryItem});
  const [showDetails,setShowDetails]=useState(false);
  const visibleInputs=showDetails?inputs:inputs.slice(0,3);
  // Keep workbook letters stable when estimator-detail columns F–L are collapsed.
  const visibleHeaders=headers.map((label,index)=>({label,index})).filter(({index})=>showDetails||index<5||index>11);
  const columnWidths=[90,...visibleHeaders.map(({index})=>index===0?320:index===1?280:index===12?120:90)];
  const tableWidth=columnWidths.reduce((sum,width)=>sum+width,0);
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
    <div className={styles.toolbar} style={{padding:'6px 10px'}}>
      {onAdd&&<button type="button" onClick={onAdd}>Add item</button>}
      <button type="button" aria-expanded={showDetails} onClick={()=>{setShowDetails(value=>!value);onViewChange?.();}}>{showDetails?'Hide estimate details':'Show estimate details'}</button>
    </div>
    {itemActions.feedback}
    <div className={styles.scroll} role="region" aria-label="Quote spreadsheet" tabIndex={0}>
      <table key={String(showDetails)} aria-label="Quote Builder estimates and budgets" style={{minWidth:tableWidth}}>
        <colgroup>{columnWidths.map((width,index)=><col key={index} style={{width:`${width/tableWidth*100}%`}}/>)}</colgroup>
        <thead>
          <tr className={styles.letters}><th aria-label="Item number"/>{visibleHeaders.map(({index})=><th key={index} scope="col" className={index===0?styles.frozen:undefined}>{String.fromCharCode(65+index)}</th>)}</tr>
          <tr className={styles.columnHeaders}><th>Item #</th>{visibleHeaders.map(({label,index})=><th key={label} scope="col" className={index===0?styles.frozen:undefined}>{label}</th>)}</tr>
        </thead>
        <tbody>{quote.lines.map((line,index)=>{
          const row=rows.get(line.id);
          return <tr key={line.id} data-section={line.type==='beMatrix / SEG'?'bematrix':line.type.includes('Travel')?'travel':line.type.includes('Design')?'design':line.type.includes('Project Management')?'management':/Installer|Labor|Stage/.test(line.type)?'labor':'items'}>
            <th scope="row" className={styles.rowNumber}><div className={styles.itemNumber}>
              {itemActions.menu(line.id,`Item ${index+1} actions · ${line.name}`)}<span>{`Item ${index+1}`}</span></div></th>
            <td className={`${styles.entry} ${styles.frozen}`}><div className={styles.nameCell}><div className={styles.growingName}><span aria-hidden="true">{line.name+" "}</span><textarea rows={1} aria-label={`Line item ${index+1}`} value={line.name} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}} onChange={e=>edit(next=>{next.lines.find(l=>l.id===line.id)!.name=e.target.value.replace(/\n/g,' ');})}/></div><button type="button" aria-label={`Open takeoffs · ${line.name}`} title="Open takeoffs" onClick={()=>onTakeoffs(line.id)}>↗</button></div></td>
            <td className={styles.entry}><div className={styles.typeCell}><span aria-hidden="true">{typeLabel(line.type)}</span><select aria-label={`Line type · ${line.name}`} value={line.type} onChange={e=>edit(next=>{next.lines.find(l=>l.id===line.id)!.type=e.target.value as typeof line.type;})}>{!builderTypes.some(([type])=>type===line.type)&&<option hidden disabled value={line.type}>{line.type}</option>}{builderTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div></td>
            {visibleInputs.map(({key,heading})=>inputCell(line,key,heading))}
            {showDetails&&<td title="Support person-days are entered in Estimators → Install. This template column does not feed pricing." className={styles.unused}>—</td>}
            {inputCell(line,'cost','Cost $')}
            <td>{row ? amount(row.calculatedPrice) : '—'}</td>
            <td className={styles.entry}><div className={styles.inputCell}><span className={styles.currencyPrefix} aria-hidden="true">$</span><input type="number" min="0" step="any" aria-label={`Price override · ${line.name}`} value={line.priceOverride??''} placeholder="—" onChange={e=>edit(next=>{next.lines.find(l=>l.id===line.id)!.priceOverride=e.target.value===''?null:Number(e.target.value);})}/>{line.priceOverride!==null && <button type="button" className={styles.restore} aria-label={`Restore price · ${line.name}`} title="Restore computed price" onClick={()=>edit(next=>{next.lines.find(l=>l.id===line.id)!.priceOverride=null;})}>↺</button>}</div></td>
            <td className={styles.finalPrice}>{row ? amount(row.finalPrice) : '—'}</td>
            {outputs.map(([key])=><td key={key}>{row ? (key==='hoursAllowed'?numeric(row[key]):amount(row[key])) : '—'}</td>)}
            <td className={row?.belowOverhead?styles.belowOverhead:undefined} title="Red means margin is below the OpEx recovery percentage.">{row?.marginPercent != null ? `${(row.marginPercent*100).toFixed(1)}%` : '—'}</td>
          </tr>;
        })}</tbody>
        {calculation && <tfoot><tr><th/><th className={styles.frozen}>GRAND TOTAL</th><td colSpan={showDetails?12:5}/><td>{amount(calculation.totals.calculatedPrice)}</td><td/><td>{amount(calculation.totals.price)}</td>{outputs.map(([key])=><td key={key}>{key==='hoursAllowed'?numeric(calculation.totals[key]):amount(calculation.totals[key])}</td>)}<td className={calculation.totals.price>0&&calculation.totals.margin/calculation.totals.price<quote.settings.opex?styles.belowOverhead:undefined}>{calculation.totals.price ? `${(calculation.totals.margin/calculation.totals.price*100).toFixed(1)}%` : '—'}</td></tr></tfoot>}
      </table>
    </div>
    {calculation && <div className={styles.economics}><h3>Project economics</h3><dl>{[
      ['Total quote (incl. PM fee)',calculation.totals.price],['Total build budget',calculation.totals.buildBudget],
      ['Contingency reserve',calculation.totals.contingency],['Indirect labor levy',calculation.totals.indirect],
      ['Waste levy',calculation.totals.waste],['Commission payout',calculation.totals.commission],
      ['Margin after reserve + levies',calculation.totals.margin],['PM bonus reserve (top tier)',calculation.totals.pmBonus],
      ['OpEx recovery',calculation.totals.opex],['Planned net',calculation.totals.netProfit],['Discount check (final − computed)',calculation.totals.discount],
    ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{currency(Number(value))}</dd></div>)}</dl></div>}
  </div>;
}
