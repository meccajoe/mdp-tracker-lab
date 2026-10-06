'use client';
import {useState} from 'react';
import {type QuoteV27} from '@/lib/quote-v27';
import {quoteBOM} from '@/lib/quote-bom';
import {useQuoteCatalog} from './use-quote-catalog';
import styles from './quote-estimator-sheet.module.css';
const money=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});
export function QuoteMaterialsDB({quote}:{quote:QuoteV27}){
 const live=useQuoteCatalog(),[query,setQuery]=useState('');
 const materials=(live.materials??quote.catalog).filter(material=>material.name.toLowerCase().includes(query.toLowerCase()));
 return <div className={styles.sheet}><h2>Materials DB</h2><p>{live.status} <button onClick={()=>void live.refresh()}>Refresh now</button></p><p>Current inventory choices. Existing takeoff prices remain saved until you choose Use latest price.</p><p><input aria-label="Search Materials DB" placeholder="Search materials and labor…" value={query} onChange={event=>setQuery(event.target.value)}/></p>{live.warnings.map(warning=><p key={warning}>{warning}</p>)}<table><thead><tr><th>Materials & Labor</th><th>Unit</th><th>Unit cost</th></tr></thead><tbody>{materials.map(material=><tr key={material.id}><th>{material.name}</th><td>{material.unit}</td><td>{money(material.unitCost)}</td></tr>)}</tbody></table></div>;
}
export function QuoteBOM({quote}:{quote:QuoteV27}){
 const rows=quoteBOM(quote);
 return <div className={styles.sheet}><h2>Bill of Materials — project purchasing view</h2><p>Material quantities across all takeoffs, including section multipliers. Labor rows excluded. Differently priced rows retain their exact costs.</p><table><thead><tr>{['Material','Unit','Total qty','Unit cost (first seen)','Total material $','Used on (items)'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={JSON.stringify([row.name,row.unit])}><th>{row.name}</th><td>{row.unit}</td><td>{row.quantity}</td><td>{money(row.unitCost)}</td><td>{money(row.cost)}</td><td>{row.items.join(', ')}</td></tr>)}</tbody></table></div>;
}
