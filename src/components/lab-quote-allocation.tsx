'use client';
import {useEffect,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {adaFetch} from '@/lib/ada-client';
import {allocationAmounts,sumAllocation,summarizeAllocation,matchLineSku,validSkuReference,sellPercentage,type AllocationAmounts,type AllocationLine,type SkuReference} from '@/lib/lab-quote-allocation';
import type {Payload} from '@/components/lab-project-detail';
const cash=(value:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
const number=(value:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value);
const percent=(value:number)=>new Intl.NumberFormat('en-US',{minimumFractionDigits:1,maximumFractionDigits:1}).format(Number(value.toFixed(10)));
function CostAmount({amount,sell}:{amount:number;sell:number}){
 const pct=sellPercentage(amount,sell);
 return <div className="pm-allocation-amount"><strong>{cash(amount)}</strong><span>{pct===null?'No sell amount':`${percent(pct)}% of sell`}</span></div>;
}
export function LabQuoteAllocation({projectId,source}:{projectId:string;source:Payload['source']}){
 const s=source.snapshot,quoteId=s.hubspot.selectedQuoteId;
 const cached=validSkuReference(s.hubspot.skuReference,quoteId)?s.hubspot.skuReference:null;
 const [view,setView]=useState<'lines'|'summary'>('lines'),[refresh,setRefresh]=useState(0);
 const [reference,setReference]=useState<SkuReference|null>(cached),[loading,setLoading]=useState(!cached),[notice,setNotice]=useState('');
 useEffect(()=>{
  if(cached&&refresh===0){setReference(cached);setLoading(false);return;}
  const abort=new AbortController();let current=true;setLoading(true);setNotice('');
  adaFetch(`/api/projects/${encodeURIComponent(projectId)}/quote-skus${refresh?'?refresh=1':''}`,{signal:abort.signal}).then(async response=>{
   const body=await response.json();if(!response.ok||!validSkuReference(body.reference,quoteId))throw Error(body.error||'HubSpot SKU references are unavailable.');
   if(current){setReference(body.reference);setNotice(body.notice||'');}
  }).catch(error=>{if(current)setNotice(error instanceof Error?error.message:'HubSpot SKU references are unavailable.');}).finally(()=>{if(current)setLoading(false);});
  return()=>{current=false;abort.abort();};
 },[projectId,quoteId,refresh,cached]);
 const totals=sumAllocation(s.lines);
 const rows=view==='lines'?s.lines.map(line=>({id:line.id,name:line.name,type:line.type,items:[line],amounts:allocationAmounts(line)})):summarizeAllocation(s.lines).map(group=>({id:group.type,name:group.type,type:`${group.items.length} line item${group.items.length===1?'':'s'}`,items:group.items,amounts:group.amounts}));
 const skuFor=(items:AllocationLine[])=>{
  const matches=items.map(line=>matchLineSku(line,reference,source.workspace_id,source.workbook_revision));
  const skus=[...new Set(matches.flatMap(m=>m?[m.sku]:[]))];const unresolved=matches.filter(m=>!m).length;
  return <div className="pm-allocation-skus">{skus.map(sku=><span className="pm-sku-chip" key={sku} title={[...new Set(matches.filter(m=>m?.sku===sku).map(m=>m!.name))].join(' · ')}>{sku}</span>)}{unresolved>0&&<span className="pm-sku-pending">{loading?'Loading…':!reference?'Unavailable':skus.length?`${unresolved} need mapping`:'Needs mapping'}</span>}</div>;
 };
 const amountCells=(a:AllocationAmounts)=><><td data-label="Sell">{cash(a.sell)}</td><td data-label="Labor hours">{number(a.hours)} hrs</td><td data-label="Materials"><CostAmount amount={a.materials} sell={a.sell}/></td><td data-label="Other"><CostAmount amount={a.other} sell={a.sell}/></td><td data-label="Labor budget"><CostAmount amount={a.labor} sell={a.sell}/></td><td data-label="Build budget"><CostAmount amount={a.build} sell={a.sell}/></td></>;
 return <section className="pm-quote-allocation">
  <dl className="pm-allocation-glance">
   <div><dt>Quote total</dt><dd>{cash(s.totals.price)}</dd></div>
   <div><dt>Labor budget</dt><dd>{cash(s.totals.laborBudget)}</dd><strong>{number(s.totals.hoursAllowed)} hrs</strong><span>{sellPercentage(s.totals.laborBudget,s.totals.price)===null?'No sell amount':`${percent(s.totals.laborBudget/s.totals.price*100)}% of sell`}</span></div>
   <div><dt>Materials budget</dt><dd>{cash(totals.materials)}</dd><span>{s.totals.price>0?`${percent(totals.materials/s.totals.price*100)}% of sell`:'No sell amount'}</span></div>
   <div><dt>Other budget</dt><dd>{cash(totals.other)}</dd><span>{s.totals.price>0?`${percent(totals.other/s.totals.price*100)}% of sell`:'No sell amount'}</span></div>
   <div><dt>Total build budget</dt><dd>{cash(s.totals.buildBudget)}</dd><span>{s.totals.price>0?`${percent(s.totals.buildBudget/s.totals.price*100)}% of sell`:'No sell amount'}</span></div>
  </dl>
  <div className="pm-allocation-toolbar"><h2>Quote allocation</h2><div className="pm-allocation-switch" role="group" aria-label="Quote allocation view"><button aria-pressed={view==='lines'} onClick={()=>setView('lines')}>By line item</button><button aria-pressed={view==='summary'} onClick={()=>setView('summary')}>Summary</button></div></div>
  <div className="pm-allocation-table-wrap"><table className="pm-allocation-table"><thead><tr>{['SKU',view==='lines'?'Quote item':'Category','Sell','Labor hours','Materials','Other','Labor budget','Build budget'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td data-label="SKU">{skuFor(row.items)}</td><td data-label={view==='lines'?'Quote item':'Category'}><strong>{row.name}</strong><span className="pm-allocation-type">{row.type}</span></td>{amountCells(row.amounts)}</tr>)}</tbody><tfoot><tr><td colSpan={2}>Total</td>{amountCells(totals)}</tr></tfoot></table></div>
  <details className="pm-disclosure pm-budget-disclosure"><summary><strong>Allocation notes and HubSpot SKU reference</strong><ChevronDown aria-hidden="true"/></summary><div className="pm-disclosure-content space-y-3 text-sm">
   <p>Values come from saved Lab quote revision {source.workbook_revision}. Percentages are cost divided by that line’s selling amount; summary and total percentages use combined amounts.</p>
   <p>Materials covers Fabrication, Graphics and beMatrix / SEG purchased allowances. Other covers external crews, props, equipment, travel, freight and other non-material purchased allowances. These add up to the original combined purchased-cost budget; no costs have been added or counted twice.</p>
   <p>Summary groups by Lab line type. SKUs come from the selected HubSpot quote, not from the Lab cost formulas. A shared SKU can cover multiple Lab lines. Unmatched or ambiguous lines need a confirmed link before accounting handoff.</p>
   {notice&&<p role="status">{notice}</p>}
   {reference&&<><p>HubSpot quote {reference.quoteId} · verified {new Date(reference.verifiedAt).toLocaleString('en-US',{timeZone:'America/Chicago'})} Central.</p><table className="pm-sku-reference-table"><thead><tr><th>SKU</th><th>HubSpot item</th></tr></thead><tbody>{reference.lines.map((line,i)=><tr key={`${line.sku}:${line.name}:${i}`}><td data-label="SKU">{line.sku||'Not recorded'}</td><td data-label="HubSpot item">{line.name}</td></tr>)}</tbody></table></>}
   <button className="pm-text-action" disabled={loading} onClick={()=>setRefresh(n=>n+1)}>{loading?'Loading SKUs…':'Refresh SKUs from HubSpot'}</button>
  </div></details>
 </section>;
}
