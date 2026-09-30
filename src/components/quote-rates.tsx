"use client";

import type { QuoteV27, Settings } from '@/lib/quote-v27';
import styles from './quote-rates.module.css';

type Unit = '%' | '$' | '×' | 'hours' | 'minutes' | 'people';
type Rate = { key: keyof Settings; label: string; unit: Unit; note: string };
const groups: { title: string; rows: Rate[] }[] = [
  { title: 'Global parameters', rows: [
    {key:'contingency',label:'Contingency reserve',unit:'%',note:'Share of sell held as a project reserve.'},
    {key:'opex',label:'OpEx recovery',unit:'%',note:'Share of sell allocated to operating expenses.'},
    {key:'indirect',label:'Indirect labor levy',unit:'%',note:'Share of sell allocated to indirect labor.'},
    {key:'burdenedRateOverride',label:'Pinned labor cost / hour',unit:'$',note:'Optional override. Clear to use the average of trade rates below.'},
    {key:'laborSell',label:'Labor sell rate / hour',unit:'$',note:'Fabrication, graphics installation, stage/pack and disposal labor.'},
  ]},
  { title: 'Fabrication pricing', rows: [
    {key:'materialMarkup',label:'Materials markup',unit:'×',note:'Material cost × this multiplier = client charge.'},
    {key:'shopDay',label:'Shop day',unit:'hours',note:'Hours per fabrication day, per person.'},
    {key:'efficiency',label:'Task-hour efficiency',unit:'×',note:'Adjusts allowed fabrication hours only; does not adjust days.'},
  ]},
  { title: 'Graphics / SEG pricing', rows: [
    {key:'graphicsSell',label:'Graphics & SEG charge / sqft',unit:'$',note:'Client charge per square foot.'},
    {key:'graphicsCost',label:'Graphics & SEG cost / sqft',unit:'$',note:'Material, print or vendor cost per square foot.'},
    {key:'handlingMinutes',label:'beMatrix handling / panel',unit:'minutes',note:'Pull, prep, pack and reinventory time.'},
    {key:'handlingCrew',label:'beMatrix handling crew',unit:'people',note:'Handling time is multiplied by the crew size.'},
  ]},
  { title: 'Professional services', rows: [
    {key:'designSell',label:'Design / engineering / CAD / hour',unit:'$',note:'Client hourly rate.'},
    {key:'pmFee',label:'PM fee',unit:'%',note:'Applied to hard scope, excluding travel expenses, freight and the fee itself.'},
    {key:'pmBonus',label:'PM bonus reserve',unit:'%',note:'Share of gross profit reserved at the top bonus tier.'},
  ]},
  { title: 'Install & travel rate card', rows: [
    {key:'leadDay',label:'Lead day rate',unit:'$',note:'Client charge per site day.'},
    {key:'supportDay',label:'Support day rate',unit:'$',note:'Client charge per support person per site day.'},
    {key:'travelFactor',label:'Travel day billing',unit:'%',note:'Share of the day rate charged for travel.'},
    {key:'pmTravelDay',label:'PM travel day rate',unit:'$',note:'Base day rate before the travel billing percentage.'},
    {key:'siteHours',label:'Site day',unit:'hours',note:'Converts site days into labor hours.'},
    {key:'supportCost',label:'Support cost / day',unit:'$',note:'Internal cost per support person per day.'},
    {key:'offFactor',label:'Event / off-day billing',unit:'%',note:'Share of the day rate charged for an off day.'},
  ]},
  { title: 'Buy-and-resell & pass-throughs', rows: [
    {key:'equipmentMarkup',label:'Equipment rental markup',unit:'×',note:'Rental cost × this multiplier = client charge.'},
    {key:'resaleMarkup',label:'Props / resale markup',unit:'×',note:'Applies to resale lines and resale-flagged takeoffs.'},
    {key:'travelMarkup',label:'Travel & expenses markup',unit:'%',note:'Added to cost: 60% means cost × 1.60.'},
    {key:'freightMarkup',label:'Freight markup',unit:'%',note:'Percentage added to freight cost.'},
  ]},
];
const money = (value: number) => value.toLocaleString('en-US',{style:'currency',currency:'USD'});

function RateInput({label,value,unit,onChange,nullable=false}: {
  label:string; value:number|null; unit:Unit; onChange:(value:number|null)=>void; nullable?:boolean;
}) {
  const shown = value===null ? '' : unit==='%' ? Number((value*100).toPrecision(15)) : value;
  return <div className={styles.input}>
    {unit==='$' && <span aria-hidden="true">$</span>}
    <input aria-label={`${label} (${unit})`} type="number" min="0" step="any" value={shown}
      placeholder={nullable?'—':'0'} onChange={event=>{
        const entered=event.target.value;
        onChange(entered==='' ? (nullable?null:0) : Number(entered)/(unit==='%'?100:1));
      }}/>
    {unit!=='$' && <span aria-hidden="true">{unit}</span>}
  </div>;
}

export function QuoteRates({quote,edit,laborRate}: {
  quote:QuoteV27; edit:(change:(next:QuoteV27)=>void)=>void; laborRate:number|null;
}) {
  function setting(key:keyof Settings,value:number|null) {
    edit(next=>{if(key==='burdenedRateOverride')next.settings[key]=value;else next.settings[key]=value??0;});
  }
  return <div className={styles.sheet}>
    <header className={styles.header}><h2>Quote Template — Settings</h2><p>Yellow cells are editable. Rates are saved with each quote revision.</p></header>
    <div className={styles.commission}><span>Sales commission</span><RateInput label="Sales commission" unit="%" value={quote.commission} onChange={value=>edit(next=>{next.commission=value??0;})}/><p>Enter 10 for 10%. Zero means no commission.</p></div>
    {groups.map(group=><section key={group.title} aria-label={group.title} className={styles.group}>
      <h3>{group.title}</h3>
      <div className={styles.columnHead} aria-hidden="true"><span>Parameter</span><span>Value</span><span>Notes</span></div>
      {group.rows.map(row=><div key={row.key} className={styles.row}>
        <span className={styles.label}>{row.label}</span>
        <div><RateInput label={row.label} unit={row.unit} value={quote.settings[row.key]} nullable={row.key==='burdenedRateOverride'} onChange={value=>setting(row.key,value)}/>
          {row.key==='burdenedRateOverride' && quote.settings.burdenedRateOverride!==null && <button type="button" className={styles.restore} onClick={()=>setting(row.key,null)}>Restore calculated rate</button>}</div>
        <p>{row.note}</p>
      </div>)}
      {group.title==='Global parameters' && <div className={styles.calculated}><span>Labor cost in use / hour</span><strong>{laborRate===null?'Unavailable':money(laborRate)}</strong><span>{quote.settings.burdenedRateOverride===null?'Calculated from trade wages and burden multiplier.':'Manual rate override in use.'}</span></div>}
    </section>)}
    <section className={styles.group} aria-label="Trade labor costs"><h3>Trade labor costs</h3>
      <div className={styles.row}><span className={styles.label}>Wage burden multiplier</span><RateInput label="Wage burden multiplier" unit="×" value={quote.settings.burdenMultiplier} onChange={value=>setting('burdenMultiplier',value)}/><p>Base wage × this multiplier = burdened cost.</p></div>
      <div className={styles.tradeHead}><span>Labor type</span><span>Base wage / hour</span><span>Burdened cost / hour</span></div>
      {quote.trades.map(trade=><div className={styles.trade} key={trade.id}><span>{trade.name}</span><RateInput label={`Wage ${trade.name}`} unit="$" nullable value={trade.wage} onChange={value=>edit(next=>{next.trades.find(t=>t.id===trade.id)!.wage=value;})}/><span className={styles.tradeCost}>{trade.wage===null?'—':money(trade.wage*quote.settings.burdenMultiplier)}</span></div>)}
      <p className={styles.footnote}>Blank and zero wages are excluded from the calculated average. A pinned labor cost overrides that average.</p>
    </section>
  </div>;
}
