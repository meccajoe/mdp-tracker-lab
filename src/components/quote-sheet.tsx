"use client";

import { calculateQuoteV27, LINE_TYPES, type Inputs, type QuoteV27 } from '@/lib/quote-v27';
import styles from './quote-sheet.module.css';

type Calculation = ReturnType<typeof calculateQuoteV27>;
const amount = (n: number) => n === 0 ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
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
const headers = ['Line item','Line type',...inputs.map(i=>i.heading),'Support crew',
  'Cost $ (equip / props / expenses / freight / dump fees)','COMPUTED PRICE','Price override','FINAL PRICE',
  ...outputs.map(([,label])=>label),'Margin %'];

export function QuoteSheet({ quote, calculation, edit, onTakeoffs, onAdd }: {
  quote: QuoteV27;
  calculation: Calculation | null;
  edit: (change: (next: QuoteV27) => void) => void;
  onTakeoffs: (lineId: string) => void;
  onAdd: () => void;
}) {
  const rows = new Map(calculation?.lines.map(line=>[line.id,line]));
  function inputCell(line: QuoteV27['lines'][number], key: keyof Inputs, label: string) {
    const calculated = rows.get(line.id)?.calculatedInputs[key] ?? line.inputs[key];
    const override = line.overrides[key];
    const overridden = override != null;
    const update = (value: number | null) => edit(next=>{next.lines.find(l=>l.id===line.id)!.overrides[key]=value;});
    return <td key={key} className={`${styles.entry} ${overridden ? styles.overridden : ''}`}>
      <div className={styles.inputCell}>
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
        <button type="button" onClick={onAdd}>Add item</button>
        <span>Open an item’s takeoffs with ↗. Scroll right for pricing and budgets.</span>
      </div>
    </div>
    <div className={styles.scroll} role="region" aria-label="Quote spreadsheet" tabIndex={0}>
      <table aria-label="Quote Builder estimates and budgets">
        <colgroup><col style={{width:36}}/><col style={{width:240}}/><col style={{width:170}}/>{headers.slice(2).map((_,i)=><col key={i} style={{width:i===10?130:95}}/>)}</colgroup>
        <thead>
          <tr className={styles.letters}><th aria-label="Row number"/>{headers.map((_,i)=><th key={i} scope="col" className={i===0?styles.frozen:undefined}>{String.fromCharCode(65+i)}</th>)}</tr>
          <tr className={styles.columnHeaders}><th>4</th>{headers.map((label,i)=><th key={label} scope="col" className={i===0?styles.frozen:undefined}>{label}</th>)}</tr>
        </thead>
        <tbody>{quote.lines.map((line,index)=>{
          const row=rows.get(line.id);
          return <tr key={line.id}>
            <th scope="row" className={styles.rowNumber}>{index+5}</th>
            <td className={`${styles.entry} ${styles.frozen}`}><div className={styles.nameCell}><input aria-label={`Line item ${index+1}`} value={line.name} onChange={e=>edit(next=>{next.lines.find(l=>l.id===line.id)!.name=e.target.value;})}/><button type="button" aria-label={`Open takeoffs · ${line.name}`} title="Open takeoffs" onClick={()=>onTakeoffs(line.id)}>↗</button></div></td>
            <td className={styles.entry}><select aria-label={`Line type · ${line.name}`} value={line.type} onChange={e=>edit(next=>{next.lines.find(l=>l.id===line.id)!.type=e.target.value as typeof line.type;})}>{LINE_TYPES.map(type=><option key={type}>{type}</option>)}</select></td>
            {inputs.map(({key,heading})=>inputCell(line,key,heading))}
            <td title="Support person-days are entered in Estimators → Install. This template column does not feed pricing." className={styles.unused}>—</td>
            {inputCell(line,'cost','Cost $')}
            <td>{row ? amount(row.calculatedPrice) : '—'}</td>
            <td className={styles.entry}><div className={styles.inputCell}><input type="number" min="0" step="any" aria-label={`Price override · ${line.name}`} value={line.priceOverride??''} placeholder="—" onChange={e=>edit(next=>{next.lines.find(l=>l.id===line.id)!.priceOverride=e.target.value===''?null:Number(e.target.value);})}/>{line.priceOverride!==null && <button type="button" className={styles.restore} aria-label={`Restore price · ${line.name}`} title="Restore computed price" onClick={()=>edit(next=>{next.lines.find(l=>l.id===line.id)!.priceOverride=null;})}>↺</button>}</div></td>
            <td className={styles.finalPrice}>{row ? amount(row.finalPrice) : '—'}</td>
            {outputs.map(([key])=><td key={key}>{row ? (key==='hoursAllowed'?numeric(row[key]):amount(row[key])) : '—'}</td>)}
            <td>{row?.marginPercent != null ? `${(row.marginPercent*100).toFixed(1)}%` : '—'}</td>
          </tr>;
        })}</tbody>
        {calculation && <tfoot><tr><th/><th className={styles.frozen}>GRAND TOTAL</th><td colSpan={12}/><td>{amount(calculation.totals.calculatedPrice)}</td><td/><td>{amount(calculation.totals.price)}</td>{outputs.map(([key])=><td key={key}>{key==='hoursAllowed'?numeric(calculation.totals[key]):amount(calculation.totals[key])}</td>)}<td>{calculation.totals.price ? `${(calculation.totals.margin/calculation.totals.price*100).toFixed(1)}%` : '—'}</td></tr></tfoot>}
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
