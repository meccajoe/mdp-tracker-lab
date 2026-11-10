'use client';
import {quoteMoney} from '@/lib/quote-format';
import {calculateQuoteV27,type QuoteV27} from '@/lib/quote-v27';
import {quoteBOM} from '@/lib/quote-bom';
import {TrackerCatalog} from './tracker-catalog';
import {QuoteReportTable} from './quote-report-table';
import {quoteItemLabel} from '@/lib/quote-takeoff-grid';
const money=quoteMoney;
export function QuoteMaterialsDB(){return <TrackerCatalog/>;}
export function QuoteBOM({quote,calculation}:{quote:QuoteV27;calculation:ReturnType<typeof calculateQuoteV27>}){
 const rows=quoteBOM(quote,calculation.takeoffs);
 return <div className="min-w-0 text-sm"><h2>Bill of Materials — project purchasing view</h2><p>Material quantities across all takeoffs, including section multipliers. Labor rows excluded. Differently priced rows retain their exact costs.</p>
 <QuoteReportTable label="Overall BOM" widths={[260,100,100,150,150,260]} identityColumns={1}><thead><tr>{['Material','Unit','Total qty','Unit cost (first seen)','Total material $','Used on (items)'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={JSON.stringify([row.name,row.unit])}><th scope="row">{row.name}</th><td>{row.unit}</td><td>{row.quantity}</td><td>{money(row.unitCost)}</td><td>{money(row.cost)}</td><td>{row.items.join(', ')}</td></tr>)}</tbody></QuoteReportTable>
 <h2>Per-item BOM</h2><QuoteReportTable label="Per-item BOM" widths={[90,260,320,100,110,160]}><thead><tr>{['Item #','Item Name','Material','Unit','Quantity','Material cost'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{quote.lines.flatMap(line=>quoteBOM(quote,calculation.takeoffs.filter(r=>r.lineId===line.id)).map(row=><tr key={JSON.stringify([line.id,row.name,row.unit])}><td>{quoteItemLabel(quote,line.id)}</td><th scope="row">{line.name}</th><td>{row.name}</td><td>{row.unit}</td><td>{row.quantity}</td><td>{money(row.cost)}</td></tr>))}</tbody></QuoteReportTable></div>;
}
