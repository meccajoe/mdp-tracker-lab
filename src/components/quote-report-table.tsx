'use client';
import type {ReactNode} from 'react';
import {useStickyTableColumns} from './use-sticky-table-columns';
import styles from './quote-report-table.module.css';

export function QuoteReportTable({label,widths,identityColumns=2,children}:{label:string;widths:number[];identityColumns?:1|2;children:ReactNode}){
 const ref=useStickyTableColumns(identityColumns);
 return <div className={styles.scroll} role="region" aria-label={`${label} scroll area`} tabIndex={0}>
  <table ref={ref} aria-label={label} className={styles.table} data-frozen={identityColumns} style={{minWidth:widths.reduce((sum,width)=>sum+width,0)}}>
   <colgroup>{widths.map((width,i)=><col key={i} style={{width}}/>)}</colgroup>{children}
  </table>
 </div>;
}
