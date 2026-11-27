'use client';
import type {calculateQuoteV27} from '@/lib/quote-v27';
import {quoteCostOfSales} from '@/lib/quote-cost-of-sales';
import styles from './quote-workbook.module.css';
const money=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});
export function QuoteEconomics({calculation}:{calculation:ReturnType<typeof calculateQuoteV27>}){
 const t=calculation.totals,{costOfSales,grossProfit}=quoteCostOfSales(t),pct=(n:number)=>t.price?`${(100*n/t.price).toFixed(1)}%`:'—';
 return <aside className={styles.economicsDock} aria-label="Project economics"><strong>Project economics</strong>
  <div>Quote total <b>{money(t.price)}</b></div>
  <details open><summary>Cost of sales (COS) <b>{money(costOfSales)}</b></summary>{[['Build budget',t.buildBudget],['Contingency',t.contingency],['Indirect levy',t.indirect],['Waste levy',t.waste],['Commission',t.commission]].map(([label,value])=><div key={label}>{label}<b>{money(Number(value))}</b></div>)}</details>
  <div>Gross profit <b>{money(grossProfit)} · {pct(grossProfit)}</b></div>
  <div>Planned net profit <b>{money(t.netProfit)} · {pct(t.netProfit)}</b></div>
  <details><summary>Overhead and net profit breakdown</summary>{[['PM bonus reserve',t.pmBonus],['OpEx recovery',t.opex],['Discount (final − computed)',t.discount]].map(([label,value])=><div key={label}>{label}<b>{money(Number(value))}</b></div>)}</details>
 </aside>;
}
