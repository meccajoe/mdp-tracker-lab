'use client';
import {defaultStorage,calculateStorage,type StorageEstimate} from '@/lib/quote-storage';
import {EMPTY_INPUTS,type QuoteV27} from '@/lib/quote-v27';
import {quoteMoney,quoteNumber} from '@/lib/quote-format';
import {QuoteNumberInput} from './quote-number-input';

const control='rounded border border-border bg-background px-2 py-1 text-sm';
const methods=['Square foot','Cubic foot × non-stackable multiplier','Floor-to-ceiling'];
export function QuoteStorage({quote,edit,readOnly}:{quote:QuoteV27;edit:(change:(next:QuoteV27)=>void)=>void;readOnly:boolean}){
  const storage=quote.storage??defaultStorage();
  const result=calculateStorage(storage);
  const linked=quote.lines.find(line=>line.id===storage.lineId);
  function update(change:(next:StorageEstimate)=>void){edit(q=>{q.storage??=defaultStorage();change(q.storage);});}
  function input(label:string,value:number,change:(value:number)=>void,min=0,max=1e6){return <label className="flex items-center justify-between gap-4 text-sm"><span>{label}</span><QuoteNumberInput aria-label={label} className={`${control} w-28 text-right`} value={value||''} min={min} max={max} step="any" onChange={e=>{const value=Number(e.target.value);if(Number.isFinite(value)&&value>=min&&value<=max)change(value);}}/></label>;}
  return <fieldset disabled={readOnly} className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded border bg-muted/30 p-3">
      <div><h2 className="font-semibold">Storage</h2><p className="text-xs text-muted-foreground">Monthly pricing for dedicated storage space.</p></div>
      <label className="text-sm">Pricing method <select aria-label="Storage pricing method" className={control} value={storage.method} onChange={e=>update(s=>{s.method=Number(e.target.value) as 1|2|3;})}>{methods.map((name,i)=><option key={name} value={i+1}>Method {i+1} — {name}</option>)}</select></label>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 rounded border p-4">
        {input('Footprint (sq ft)',storage.footprint,v=>update(s=>{s.footprint=v;}))}
        {input('Contract term (months)',storage.months,v=>update(s=>{s.months=v;}),.01,1200)}
        {input('Average item height (ft) — Method 2',storage.itemHeight,v=>update(s=>{s.itemHeight=v;}),0,1000)}
        <p className="text-xs text-muted-foreground">Method 1 uses floor space only. Method 2 uses item height. Method 3 reserves the full usable ceiling height.</p>
      </div>
      <div className="rounded border bg-emerald-50/50 p-4 text-foreground">
        <h3 className="text-sm font-semibold">Selected: Method {storage.method}</h3>
        <p className="mt-2 text-sm font-medium">Quote amount: {quoteMoney(result.quotedAmount)}{storage.billing==='monthly'?' per month':' for the contract (saved pricing)'}</p>
        {storage.billing!=='monthly'&&<button type="button" className={control} onClick={()=>update(s=>{s.billing='monthly';})}>Use monthly amount in quote</button>}
        <div className="mt-3 grid grid-cols-3 gap-3">{[['Monthly',result.selected.monthly],['Annual',result.selected.annual],['Contract total',result.selected.contract]].map(([label,value])=><div key={label}><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-semibold tabular-nums">{quoteMoney(Number(value))}</div></div>)}</div>
        <p className="my-3 text-xs text-muted-foreground">Annual and contract totals are reference amounts. Storage rates are selling prices. No additional markup, levies, contingency or PM fee is added. Commission remains an expense in margin. Quote selling-price rounding follows this quote’s saved pricing policy. Enter any direct storage costs on the quote item.</p>
        {linked?<><p className="text-sm">Included in quote as <strong>{linked.name}</strong>. Changes here update its calculated price.</p>{linked.priceOverride!==null&&<p role="status" className="text-sm text-amber-800">A manual selling-price override of {quoteMoney(linked.priceOverride)} takes precedence.</p>}</>:<button type="button" className={control} disabled={!storage.footprint||quote.lines.length>=200} onClick={()=>edit(q=>{q.storage??=defaultStorage();const id=crypto.randomUUID();q.lines.push({id,name:'Storage (per month)',type:'Storage',takeoffDriven:false,inputs:{...EMPTY_INPUTS},overrides:{},priceOverride:null});q.storage.lineId=id;})}>Add storage to quote</button>}
      </div>
    </div>
    <div className="overflow-x-auto rounded border"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>{['Method','Billable space','Monthly','Annual','Contract total'].map(label=><th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{result.methods.map((method,i)=><tr key={method.method} className={storage.method===method.method?'bg-emerald-50/50':'border-t'}><th className="p-2 text-left font-medium">Method {method.method} — {methods[i]}</th><td className="p-2">{quoteNumber(i===0?storage.footprint:i===1?result.billableVolume:result.floorToCeilingVolume)} {i===0?'sq ft':'cu ft'}</td><td className="p-2">{quoteMoney(method.monthly)}</td><td className="p-2">{quoteMoney(method.annual)}</td><td className="p-2">{quoteMoney(method.contract)}</td></tr>)}</tbody></table></div>
    <details className="rounded border p-3" open><summary className="cursor-pointer text-sm font-semibold">Storage settings</summary><div className="mt-3 grid gap-x-10 gap-y-3 lg:grid-cols-2">
      {input('Method 1 rate ($/sq ft/month)',storage.settings.squareFootRate,v=>update(s=>{s.settings.squareFootRate=v;}))}
      <div className="flex flex-wrap items-center gap-2 text-xs"><span>Method 1 presets:</span>{[[1.25,'Low'],[1.73,'Industry average'],[2,'Mecca mid-market'],[2.25,'Premium']].map(([rate,label])=><button type="button" key={label} className={control} onClick={()=>update(s=>{s.settings.squareFootRate=Number(rate);})}>{label} · {quoteMoney(Number(rate))}</button>)}</div>
      {input('Method 2 rate ($/cu ft/month)',storage.settings.cubicFootRate,v=>update(s=>{s.settings.cubicFootRate=v;}))}
      {input('Non-stackable multiplier — Method 2',storage.settings.nonStackableMultiplier,v=>update(s=>{s.settings.nonStackableMultiplier=v;}),0,100)}
      {input('Method 3 rate ($/cu ft/month)',storage.settings.floorToCeilingRate,v=>update(s=>{s.settings.floorToCeilingRate=v;}))}
      {input('Usable ceiling height (ft) — Method 3',storage.settings.ceilingHeight,v=>update(s=>{s.settings.ceilingHeight=v;}),0,1000)}
    </div><p className="mt-3 text-xs text-muted-foreground">These settings are saved with this quote. Existing quotes keep their saved rates.</p></details>
  </fieldset>;
}
