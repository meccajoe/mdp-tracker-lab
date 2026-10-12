'use client';
import {type QuoteV27} from '@/lib/quote-v27';
import {quoteBOM} from '@/lib/quote-bom';
import {TrackerCatalog} from './tracker-catalog';
import styles from './quote-estimator-sheet.module.css';
const money=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});
export function QuoteMaterialsDB(){return <TrackerCatalog/>;}
export function QuoteBOM({quote}:{quote:QuoteV27}){
 const rows=quoteBOM(quote);
 return <div className={styles.sheet}><h2>Bill of Materials — project purchasing view</h2><p>Material quantities across all takeoffs, including section multipliers. Labor rows excluded. Differently priced rows retain their exact costs.</p><table><thead><tr>{['Material','Unit','Total qty','Unit cost (first seen)','Total material $','Used on (items)'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={JSON.stringify([row.name,row.unit])}><th>{row.name}</th><td>{row.unit}</td><td>{row.quantity}</td><td>{money(row.unitCost)}</td><td>{money(row.cost)}</td><td>{row.items.join(', ')}</td></tr>)}</tbody></table></div>;
}
