'use client';
import {type QuoteV27} from '@/lib/quote-v27';
import {quoteBOM} from '@/lib/quote-bom';
import {TrackerCatalog} from './tracker-catalog';
import styles from './quote-estimator-sheet.module.css';
const money=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});
export function QuoteMaterialsDB(){return <TrackerCatalog/>;}
export function QuoteBOM({quote}:{quote:QuoteV27}){
 const rows=quoteBOM(quote);
 return <div className={styles.sheet}><h2>Bill of Materials — project purchasing view</h2><p>Material quantities across all takeoffs, including section multipliers. Labor rows excluded. Differently priced rows retain their exact costs.</p><table><thead><tr>{['Material','Unit','Total qty','Unit cost (first seen)','Total material $','Used on (items)'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={JSON.stringify([row.name,row.unit])}><th>{row.name}</th><td>{row.unit}</td><td>{row.quantity}</td><td>{money(row.unitCost)}</td><td>{money(row.cost)}</td><td>{row.items.join(', ')}</td></tr>)}</tbody></table><h2>Per-item BOM</h2>{quote.lines.map((line,index)=>{const itemRows=quoteBOM({...quote,takeoffs:quote.takeoffs.filter(r=>r.lineId===line.id)});return itemRows.length?<section key={line.id}><h3>Item {index+1} — {line.name}</h3><table><thead><tr><th>Material</th><th>Unit</th><th>Quantity</th><th>Material cost</th></tr></thead><tbody>{itemRows.map(r=><tr key={JSON.stringify([r.name,r.unit])}><th>{r.name}</th><td>{r.unit}</td><td>{r.quantity}</td><td>{money(r.cost)}</td></tr>)}</tbody></table></section>:null;})}</div>;
}
